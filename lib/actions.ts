'use client';
import { useSyncExternalStore } from 'react';
import { groq, parseJson } from './ai';
import { memo, getMemo, srcById, addCtx } from './memo';
import { AX_MAX_STEPS, buildAxRequest, describeAx, validateAx, wantsSave, type AxAction, type AxSnap, type AxEl } from './axPlan';

/* =====================================================================
   Agent Actions mode runtime.
   Everything (run state, loop, EX Mouse) lives at module level and is
   rendered by components mounted once in Shell, so navigation never
   unmounts the run. Elements opt in with data-ax="id" (+ data-ax-label,
   data-ax-risk); posts with data-ax-post="tweetId" (+ data-ax-text).
   ===================================================================== */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/["\\]/g, '\\$&');
const uid = () => Math.random().toString(36).slice(2, 9);
function store<T>(init: T, ev: string) {
  let v = init;
  const get = () => v;
  const set = (p: Partial<T>) => { v = { ...v, ...p }; if (typeof window !== 'undefined') window.dispatchEvent(new Event(ev)); };
  const use = () => useSyncExternalStore((cb) => { window.addEventListener(ev, cb); return () => window.removeEventListener(ev, cb); }, get, () => init);
  return { get, set, use };
}

/* ---------------- run store ---------------- */
export type AxStepState = 'run' | 'ok' | 'fail' | 'ask' | 'done';
export interface AxStep { id: string; text: string; thought?: string; state: AxStepState; icon: string }
export interface AxRun {
  mode: boolean;                       // Actions toggle (persists across remounts)
  status: 'idle' | 'thinking' | 'acting' | 'asking' | 'confirm' | 'done' | 'stopped' | 'error';
  goal: string; steps: AxStep[]; message: string;
  question: { q: string; choices: string[] } | null;
  confirm: { label: string } | null;
}
const IDLE: AxRun = { mode: false, status: 'idle', goal: '', steps: [], message: '', question: null, confirm: null };
const run = store<AxRun>(IDLE, 'ex-ax-run');
export const useAxRun = run.use;
export const getAxRun = run.get;
export const setAxMode = (mode: boolean) => run.set({ mode });
export const axBusy = () => ['thinking', 'acting', 'confirm'].includes(run.get().status);
export const axWaiting = () => run.get().status === 'asking';
export const closeAx = () => { if (!axBusy()) run.set({ status: 'idle', goal: '', steps: [], message: '', question: null, confirm: null }); };

/* ---------------- EX Mouse store ---------------- */
export interface Mouse { on: boolean; x: number; y: number; dur: number; label: string; press: number; drag: { x: number; y: number } | null; scroll: '' | 'up' | 'down'; ripple: { x: number; y: number; k: number } | null }
const MOFF: Mouse = { on: false, x: 0, y: 0, dur: 0, label: '', press: 0, drag: null, scroll: '', ripple: null };
const mouse = store<Mouse>(MOFF, 'ex-ax-mouse');
export const useExMouse = mouse.use;
let hideT: ReturnType<typeof setTimeout> | undefined;
function mset(p: Partial<Mouse>) { if (hideT) { clearTimeout(hideT); hideT = undefined; } mouse.set({ ...p, on: true }); }
function mouseHide(delay = 1200) { if (hideT) clearTimeout(hideT); hideT = setTimeout(() => mouse.set({ ...MOFF }), delay); }

async function glide(x: number, y: number, label: string, min = 0) {
  const m = mouse.get();
  if (!m.on) { mset({ x: window.innerWidth / 2, y: window.innerHeight / 2, dur: 0, label: '' }); await sleep(30); }
  const cur = mouse.get();
  const dur = Math.max(min, Math.min(900, 260 + Math.hypot(x - cur.x, y - cur.y) * 0.45));
  mset({ x, y, dur, label });
  await sleep(dur + 40);
}
async function clickFx() {
  const m = mouse.get();
  mset({ press: m.press + 1, ripple: { x: m.x, y: m.y, k: Date.now() } });
  await sleep(220);
}

/* ---------------- router (registered by Shell) ---------------- */
let push: ((r: string) => void) | null = null;
export const setAxRouter = (fn: (r: string) => void) => { push = fn; };

/* ---------------- snapshot ---------------- */
const EXCLUDE = '.ax-panel, .ag-wrap, [aria-hidden="true"], [inert]';
function visible(el: HTMLElement) {
  if (el.closest(EXCLUDE)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Tag search inputs that don't carry data-ax yet (search UI is owned elsewhere). */
function autoTag() {
  /* legacy data-action tags (search UI is owned elsewhere) */
  document.querySelectorAll<HTMLElement>('[data-action]:not([data-ax])').forEach((el) => {
    const k = el.dataset.action || ''; if (!k) return;
    el.dataset.ax = el.dataset.tid ? `${k}:${el.dataset.tid}` : k;
    if (el.dataset.label && !el.dataset.axLabel) el.dataset.axLabel = el.dataset.label;
  });
  let n = 0;
  document.querySelectorAll<HTMLInputElement>('input[type="search"], input[placeholder*="検索"], input[aria-label*="検索"], input[placeholder*="Search"]').forEach((el) => {
    if (el.dataset.ax || el.closest(EXCLUDE)) return;
    el.dataset.ax = n ? `search-${n + 1}` : 'search'; el.dataset.axLabel = el.dataset.axLabel || '検索ボックス'; n++;
  });
}

export function snapshot(): AxSnap {
  autoTag();
  const els: AxEl[] = []; const seen = new Set<string>();
  const posts: AxSnap['posts'] = [];
  document.querySelectorAll<HTMLElement>('[data-ax-post]').forEach((el) => {
    const id = el.dataset.axPost || '';
    if (!id || posts.length >= 10 || posts.some((p) => p.id === id) || !visible(el)) return;
    posts.push({ id, text: clean(el.dataset.axText || el.textContent || '').slice(0, 120) });
  });
  const shown = new Set(posts.slice(0, 5).map((p) => p.id));
  document.querySelectorAll<HTMLElement>('[data-ax]').forEach((el) => {
    const id = el.dataset.ax || '';
    if (!id || seen.has(id) || els.length >= 48 || !visible(el)) return;
    /* per-post buttons (like:123 …) only for the first visible posts */
    const pid = el.closest<HTMLElement>('[data-ax-post]')?.dataset.axPost;
    if (pid && !shown.has(pid)) return;
    seen.add(id);
    const input = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    els.push({ id, label: clean(el.dataset.axLabel || el.getAttribute('aria-label') || (input ? (el as HTMLInputElement).placeholder : '') || el.textContent || id).slice(0, 60), risk: el.dataset.axRisk === '1' || undefined, input: input || undefined });
  });
  const folders = getMemo().folders.map((f) => ({ id: f.id, name: f.name }));
  return { route: location.pathname + location.search, els, posts, folders };
}

function findEl(sel: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(sel));
  return all.find(visible) || all.find((e) => !e.closest(EXCLUDE)) || null;
}
const byAx = (id: string) => findEl(`[data-ax="${esc(id)}"]`);
const byPost = (id: string) => findEl(`[data-ax-post="${esc(id)}"]`);
const center = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 160), y: r.top + Math.min(r.height / 2, 60), r }; };
async function reach(el: HTMLElement, label: string) {
  let c = center(el);
  if (c.r.top < 60 || c.r.bottom > window.innerHeight - 20) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(450); c = center(el); }
  await glide(c.x, c.y, label);
}

/** Wait until the route changed (if expected) and the DOM has been quiet briefly. */
async function settle(from?: string, timeout = 4000) {
  const t0 = Date.now();
  if (from != null) while (Date.now() - t0 < timeout && location.pathname + location.search === from) await sleep(100);
  let last = document.body.innerHTML.length, still = 0;
  const loading = () => !!document.querySelector('main .m3-load, main .spin-wrap');
  while (Date.now() - t0 < timeout && (still < 3 || loading())) { await sleep(150); const n = document.body.innerHTML.length; still = n === last ? still + 1 : 0; last = n; }
}

function setVal(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------------- confirmation for risky actions ---------------- */
let confirmRes: ((ok: boolean) => void) | null = null;
export function answerConfirm(ok: boolean) { const r = confirmRes; confirmRes = null; r?.(ok); }
function askConfirm(label: string) {
  run.set({ status: 'confirm', confirm: { label } });
  return new Promise<boolean>((res) => { confirmRes = res; });
}

/* ---------------- executor ---------------- */
type ExecR = { ok: boolean; note: string };
async function exec(a: AxAction, label: string, token: number): Promise<ExecR> {
  switch (a.type) {
    case 'navigate': {
      const from = location.pathname + location.search;
      if (a.route === from) return { ok: true, note: 'すでにこの画面' };
      const nav = byAx(`nav:${a.route}`);
      if (nav && visible(nav)) { await reach(nav, label); await clickFx(); nav.click(); }
      else { await glide(window.innerWidth / 2, 80, label); await clickFx(); push ? push(a.route) : (location.href = a.route); }
      await settle(from);
      return { ok: true, note: `移動後: ${location.pathname + location.search}` };
    }
    case 'click': {
      const el = byAx(a.id); if (!el) return { ok: false, note: '要素が見つからない' };
      if (el.dataset.axRisk === '1') {
        await reach(el, label);
        const ok = await askConfirm(label);
        if (token !== cur) return { ok: false, note: '停止' };
        run.set({ status: 'acting', confirm: null });
        if (!ok) return { ok: false, note: 'ユーザーが実行を拒否した。この操作はしないこと' };
      }
      const from = location.pathname + location.search;
      await reach(el, label); await clickFx(); el.click();
      await settle(location.pathname + location.search === from ? undefined : from, 2500);
      return { ok: true, note: location.pathname + location.search !== from ? `移動後: ${location.pathname + location.search}` : '' };
    }
    case 'scroll': {
      mset({ scroll: a.dir });
      await glide(window.innerWidth / 2, window.innerHeight * (a.dir === 'down' ? 0.6 : 0.4), label);
      const y0 = window.scrollY;
      window.scrollBy({ top: (a.dir === 'down' ? 1 : -1) * window.innerHeight * 0.75, behavior: 'smooth' });
      await sleep(650); mset({ scroll: '' }); await settle(undefined, 1200);
      return { ok: Math.abs(window.scrollY - y0) > 4, note: Math.abs(window.scrollY - y0) > 4 ? '' : 'これ以上スクロールできない' };
    }
    case 'type': {
      const el = byAx(a.id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el || !('value' in el)) return { ok: false, note: '入力欄が見つからない' };
      await reach(el, label); await clickFx(); el.focus();
      for (let i = 1; i <= a.text.length; i += Math.max(1, Math.ceil(a.text.length / 12))) { setVal(el, a.text.slice(0, i)); await sleep(35); }
      setVal(el, a.text); await sleep(200);
      if (a.submit && el instanceof HTMLInputElement) {
        const from = location.pathname + location.search;
        const form = el.closest('form');
        if (form) form.requestSubmit(); else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        await settle(undefined, 600);
        if (location.pathname + location.search !== from) await settle(from);
      }
      return { ok: true, note: `ルート: ${location.pathname + location.search}` };
    }
    case 'open_post': {
      const el = byPost(a.id); const from = location.pathname + location.search;
      if (el) { await reach(el, label); await clickFx(); }
      push ? push(`/status/${a.id}`) : (location.href = `/status/${a.id}`);
      await settle(from);
      return { ok: true, note: '' };
    }
    case 'add_context': {
      const s = srcById(a.postId); const el = byPost(a.postId);
      if (!s) return { ok: false, note: 'ポスト情報が見つからない' };
      if (el) { await reach(el, label); await clickFx(); }
      return addCtx(s) ? { ok: true, note: '' } : { ok: false, note: '追加済みか上限' };
    }
    case 'drag_to_keep': {
      const s = srcById(a.postId); const el = byPost(a.postId);
      if (!s || !el) return { ok: false, note: 'ポストが見つからない' };
      await reach(el, label); await clickFx();
      const start = mouse.get(); mset({ drag: { x: start.x, y: start.y } });
      const dest = byAx(`folder:${a.folderId}`) || byAx('nav:/keep');
      const d = dest && visible(dest) ? center(dest) : { x: 60, y: window.innerHeight - 120 };
      await glide(d.x, d.y, label, 750); await clickFx();
      const ok = memo.addItem({ src: s }, a.folderId);
      mset({ drag: null });
      return { ok: !!ok, note: ok ? '' : '保存済みかフォルダが無い' };
    }
    default: return { ok: true, note: '' };
  }
}

const ICON: Record<AxAction['type'], string> = { navigate: 'navigation', click: 'mouse', scroll: 'swipe', type: 'edit', open_post: 'article', drag_to_keep: 'bookmarks', add_context: 'add_link', ask_user: 'help', done: 'task_alt' };

/* ---------------- loop ---------------- */
let cur = 0;            // run token: stop() / a new run invalidates the old loop
let log: string[] = []; // this run's step log + user answers (sent to the model)

export function stopAx() {
  if (!['thinking', 'acting', 'confirm', 'asking'].includes(run.get().status)) return;
  cur++; answerConfirm(false);
  run.set({ status: 'stopped', message: '停止しました', question: null, confirm: null, steps: run.get().steps.map((s) => (s.state === 'run' ? { ...s, state: 'fail' } : s)) });
  mouseHide(300);
}

export function startAx(goal: string) {
  const g = goal.trim(); if (!g || axBusy()) return;
  log = [];
  run.set({ status: 'thinking', goal: g, steps: [], message: '', question: null, confirm: null });
  void loop(++cur);
}

/** Reply to an ask_user question; resumes the loop. */
export function answerAx(text: string) {
  const t = text.trim(); if (!t || run.get().status !== 'asking') return;
  log.push(`ユーザーの回答: ${t}`);
  run.set({ status: 'thinking', question: null, steps: [...run.get().steps, { id: uid(), text: `回答: ${t}`, state: 'done', icon: 'chat' }] });
  void loop(++cur);
}

function patchStep(id: string, p: Partial<AxStep>) { run.set({ steps: run.get().steps.map((s) => (s.id === id ? { ...s, ...p } : s)) }); }

async function loop(token: number) {
  let steps = 0, invalid = 0;
  const live = () => token === cur;
  try {
    while (live()) {
      if (steps >= AX_MAX_STEPS) { run.set({ status: 'done', message: `${AX_MAX_STEPS}ステップの上限に達したため終了しました` }); break; }
      run.set({ status: 'thinking' });
      await settle(undefined, 1500);
      const snap = snapshot();
      const saveOk = wantsSave([run.get().goal, ...log.filter((l) => l.startsWith('ユーザーの回答:'))].join('\n'));
      const out = await groq(buildAxRequest({ goal: run.get().goal, snap, log }), { tier: 'small', json: true, max: 260, temperature: 0.1 });
      if (!live()) return;
      const v = validateAx(parseJson(out), snap, saveOk);
      if (!v.action) {
        invalid++;
        log.push(`(無効な指示: ${v.error})`);
        if (invalid >= 3) { run.set({ status: 'error', message: `AI が有効な操作を返せませんでした（${v.error}）` }); break; }
        continue;
      }
      invalid = 0; steps++;
      const a = v.action;
      const text = describeAx(a, snap);
      if (a.type === 'done') {
        run.set({ status: 'done', message: a.message, steps: [...run.get().steps, { id: uid(), text: '完了', thought: v.thought, state: 'done', icon: 'task_alt' }] });
        break;
      }
      if (a.type === 'ask_user') {
        log.push(`${steps}. ${text}`);
        run.set({ status: 'asking', question: { q: a.question, choices: a.choices }, steps: [...run.get().steps, { id: uid(), text, thought: v.thought, state: 'ask', icon: 'help' }] });
        mouseHide(600);
        return; /* resumes via answerAx() */
      }
      const st: AxStep = { id: uid(), text, thought: v.thought, state: 'run', icon: ICON[a.type] };
      run.set({ status: 'acting', steps: [...run.get().steps, st] });
      let r: ExecR;
      try { r = await exec(a, text, token); } catch (e: any) { r = { ok: false, note: String(e?.message || e).slice(0, 80) }; }
      if (!live()) return;
      patchStep(st.id, { state: r.ok ? 'ok' : 'fail' });
      log.push(`${steps}. ${text} → ${r.ok ? '成功' : '失敗'}${r.note ? `（${r.note}）` : ''}`);
    }
  } catch (e: any) {
    if (live()) run.set({ status: 'error', message: e?.message || 'エラーが発生しました' });
  } finally {
    if (live() && run.get().status !== 'asking') mouseHide();
  }
}
