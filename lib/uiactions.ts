'use client';
import { useSyncExternalStore } from 'react';
import { memo, KEEP, srcById } from './memo';

/* =====================================================================
   EX Actions: structured UI actions planned by the EX Agent and
   executed here against the real DOM, with the "EX Mouse" virtual
   cursor animating to each target, highlighting it and performing
   the click / scroll / typing / drag for real.
   Interactive elements opt in via data-action="<kind>" plus
   data-tid / data-path qualifiers and a data-label description.
   ===================================================================== */

export type UiAction =
  | { type: 'navigate'; path: string }
  | { type: 'click'; target: string }
  | { type: 'scroll'; dy: number }
  | { type: 'type'; target: string; text: string; submit?: boolean }
  | { type: 'dragToMemo'; target: string }
  | { type: 'askUser'; question: string; options?: string[] }
  | { type: 'wait'; ms: number };

export interface ScreenEl { id: string; label: string; kind: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/["\\]/g, '\\$&');

/* ---------------- EX Mouse store ---------------- */
export interface MouseState { on: boolean; x: number; y: number; dur: number; label: string; press: boolean; drag: boolean }
const MOUSE_OFF: MouseState = { on: false, x: 0, y: 0, dur: 500, label: '', press: false, drag: false };
let mouse: MouseState = MOUSE_OFF;
const MEV = 'm3x-mouse';
let offTimer: ReturnType<typeof setTimeout> | undefined;
function setMouse(p: Partial<MouseState>) {
  mouse = { ...mouse, ...p, on: true };
  if (offTimer) { clearTimeout(offTimer); offTimer = undefined; }
  window.dispatchEvent(new Event(MEV));
}
export const useMouse = () => useSyncExternalStore(
  (cb) => { window.addEventListener(MEV, cb); return () => window.removeEventListener(MEV, cb); },
  () => mouse, () => MOUSE_OFF,
);
/** Fade the mouse out shortly after a run finishes. */
export function mouseOff(delay = 1100) {
  if (offTimer) clearTimeout(offTimer);
  offTimer = setTimeout(() => { mouse = MOUSE_OFF; window.dispatchEvent(new Event(MEV)); }, delay);
}

async function moveTo(x: number, y: number, label: string, minDur = 0) {
  if (!mouse.on) { // first appearance: start from screen centre, not the corner
    setMouse({ x: window.innerWidth / 2, y: window.innerHeight / 2, dur: 0, label: '' });
    await sleep(40);
  }
  const dx = x - mouse.x, dy = y - mouse.y;
  const dist = Math.hypot(dx, dy);
  const dur = Math.max(minDur, Math.min(950, 240 + dist * 0.45));
  setMouse({ x, y, dur, label });
  await sleep(dur + 40);
}
async function press(drag = false) {
  setMouse({ press: true, drag });
  await sleep(190);
}
function release() { setMouse({ press: false, drag: false }); }

/** Expanding highlight ring over an element (the "click" punctuation). */
function ring(el: Element) {
  const r = el.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'mx-ring';
  d.style.left = `${r.left - 5}px`; d.style.top = `${r.top - 5}px`;
  d.style.width = `${r.width + 10}px`; d.style.height = `${r.height + 10}px`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}

/* ---------------- Actions run store ----------------
   The whole run (flow, steps, pending question) lives at module level,
   NOT in the Agent component: on narrow screens the Agent is hosted by
   the /keep page, so a run that navigates away unmounts the Agent.
   Keeping the run here lets the executor loop keep writing progress,
   and a remounted Agent picks the same run (and its pending question)
   back up instead of the run silently dying with the component. */
export type ActStepState = 'wait' | 'run' | 'done' | 'skip';
export interface ActStep { id: string; icon: string; label: string; state: ActStepState }
export interface ActState {
  status: 'idle' | 'running' | 'waiting' | 'done' | 'error';
  goal: string; log: string[];
  steps: ActStep[]; reply: string; summary: string; error: string;
  question: { q: string; options: string[] } | null;
}
const ACT_IDLE: ActState = { status: 'idle', goal: '', log: [], steps: [], reply: '', summary: '', error: '', question: null };
let act: ActState = ACT_IDLE;
const AEV = 'm3x-act-run';
export function setAct(p: Partial<ActState>) { act = { ...act, ...p }; window.dispatchEvent(new Event(AEV)); }
export function resetAct() { act = ACT_IDLE; window.dispatchEvent(new Event(AEV)); }
export const getAct = () => act;
export const useAct = () => useSyncExternalStore(
  (cb) => { window.addEventListener(AEV, cb); return () => window.removeEventListener(AEV, cb); },
  () => act, () => ACT_IDLE,
);

/** Wait until the URL actually changes (route transition + first render). */
async function waitPathChange(from: string, timeout = 2600): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (location.pathname + location.search !== from) { await sleep(420); return true; }
    await sleep(120);
  }
  return false;
}

/* ---------------- router registry (set by Shell) ---------------- */
let pushFn: ((path: string) => void) | null = null;
export const setUiRouter = (fn: (path: string) => void) => { pushFn = fn; };

/* ---------------- screen map ---------------- */
function visible(el: HTMLElement) {
  if (el.closest('.ag-wrap, .ag-dock, [aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  return r.bottom > -40 && r.top < window.innerHeight + 40 && r.right > -40 && r.left < window.innerWidth + 40;
}
const cut = (s: string, n: number) => { const a = Array.from(s.replace(/\s+/g, ' ').trim()); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };

/** Collect the actionable elements currently on screen, for the planner. */
export function collectScreen(): { path: string; els: ScreenEl[] } {
  const els: ScreenEl[] = [];
  const seen = new Set<string>();
  let posts = 0, subs = 0;
  document.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    const kind = el.dataset.action || '';
    const q = el.dataset.tid || el.dataset.path || '';
    const id = q ? `${kind}:${q}` : kind;
    if (!kind || seen.has(id) || !visible(el)) return;
    if (kind === 'post') { if (posts >= 8) return; posts++; }
    /* Post sub-actions only make sense inside a post article (timeline card
       or the main post on the detail screen). */
    if (kind === 'like' || kind === 'bookmark' || kind === 'reply') { if (subs >= 18 || !el.closest('article')) return; subs++; }
    seen.add(id);
    els.push({ id, kind, label: cut(el.dataset.label || el.getAttribute('aria-label') || el.textContent || id, 60) });
  });
  return { path: location.pathname + location.search, els: els.slice(0, 64) };
}

/** Resolve a screen-map id ("kind:qualifier") back to its element. */
export function resolveTarget(id: string): HTMLElement | null {
  const i = id.indexOf(':');
  const kind = i < 0 ? id : id.slice(0, i);
  const q = i < 0 ? '' : id.slice(i + 1);
  const sel = q ? `[data-action="${esc(kind)}"][data-tid="${esc(q)}"], [data-action="${esc(kind)}"][data-path="${esc(q)}"]` : `[data-action="${esc(kind)}"]`;
  const all = Array.from(document.querySelectorAll<HTMLElement>(sel));
  return all.find((el) => visible(el)) || all[0] || null;
}

const center = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
async function moveToEl(el: HTMLElement, label: string) {
  let { x, y, r } = center(el);
  if (r.top < 70 || r.bottom > window.innerHeight - 30) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(420);
    ({ x, y } = center(el));
  }
  await moveTo(x, y, label);
}

function setVal(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, v); else el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ---------------- executor ---------------- */
export type ExecResult = 'ok' | 'skip' | 'ask';

export async function execAction(a: UiAction): Promise<ExecResult> {
  switch (a.type) {
    case 'askUser': return 'ask';
    case 'wait': await sleep(Math.min(Math.max(a.ms, 0), 3000)); return 'ok';
    case 'scroll': {
      await moveTo(window.innerWidth * 0.5, window.innerHeight * 0.45, a.dy >= 0 ? '下へスクロール' : '上へスクロール');
      window.scrollBy({ top: a.dy, behavior: 'smooth' });
      await sleep(650);
      return 'ok';
    }
    case 'navigate': {
      const from = location.pathname + location.search;
      const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-action="nav"][data-path="${esc(a.path)}"]`));
      const el = els.find((e) => visible(e)) || els[0];
      if (el) {
        if (visible(el)) await moveToEl(el, `${a.path} へ移動`);
        ring(el);
        await press(); el.click(); release();
      } else if (pushFn) {
        await moveTo(window.innerWidth * 0.5, 90, `${a.path} へ移動`);
        pushFn(a.path);
      } else return 'skip';
      /* Wait for the route to actually change and settle — a fixed sleep
         re-plans against the OLD screen on slow devices. */
      if (a.path !== from) await waitPathChange(from); else await sleep(600);
      await sleep(250);
      return 'ok';
    }
    case 'click': {
      let el = resolveTarget(a.target);
      if (!el) { await sleep(700); el = resolveTarget(a.target); }
      if (!el) return 'skip';
      await moveToEl(el, 'クリック');
      ring(el);
      await press(); el.click(); release();
      await sleep(480);
      return 'ok';
    }
    case 'type': {
      const el = resolveTarget(a.target) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el || !('value' in el)) return 'skip';
      await moveToEl(el, '入力');
      await press(); el.focus(); el.click(); release();
      setVal(el, a.text);
      await sleep(320);
      if (a.submit) {
        const from = location.pathname + location.search;
        const form = el.closest('form');
        if (form) form.requestSubmit();
        else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await waitPathChange(from, 1400); // submits usually navigate (e.g. search)
        await sleep(300);
      }
      return 'ok';
    }
    case 'dragToMemo': {
      const el = resolveTarget(a.target);
      const tid = a.target.split(':')[1] || '';
      const src = tid ? srcById(tid) : undefined;
      if (!el || !src) return 'skip';
      const from = center(el);
      await moveTo(from.x, from.y, 'ポストをつかんで Keep へドラッグ');
      await press(true);
      const keep = document.querySelector<HTMLElement>('[data-action="folder"][data-tid="keep"]');
      const nav = document.querySelector<HTMLElement>('[data-action="nav"][data-path="/keep"]');
      const dest = (keep && visible(keep)) ? center(keep) : (nav && visible(nav)) ? center(nav) : { x: 84, y: window.innerHeight - 130 };
      await moveTo(dest.x, dest.y, 'ポストをつかんで Keep へドラッグ', 780);
      if (keep && visible(keep)) ring(keep); else if (nav && visible(nav)) ring(nav);
      const okAdd = memo.addItem({ src }, KEEP); // toasts the result itself
      release();
      await sleep(380);
      return okAdd ? 'ok' : 'skip';
    }
  }
}
