'use client';
import { useLocal } from './ai';
import type { XTweet, XMedia } from './types';

export const MIME = 'application/x-m3x-post';
export const MIME_MEDIA = 'application/x-m3x-media';
export const MAX_SRC = 30;
export const KEEP = 'keep';
export interface Src { id: string; handle: string; name: string; avatar?: string; text: string; image?: string; at?: string }
export interface KMedia { type: XMedia['type']; url: string; thumb?: string; video?: string; w?: number; h?: number }
/** A saved post or a single media item from a post. */
export interface Item { id: string; src: Src; media?: KMedia; added: number }
export interface Note { id: string; title: string; body: string; place?: string; sources: Src[]; created: number; updated: number }
export interface Folder { id: string; name: string; notes: Note[]; items?: Item[]; keep?: boolean; created: number }
export interface MemoState { folders: Folder[] }

const K = 'm3x.memo', ON = 'm3x.memoOn', EV = 'm3x-memo', UNDO = 'm3x.memoUndo';
const keepFolder = (): Folder => ({ id: KEEP, name: 'Keep', notes: [], items: [], keep: true, created: 0 });
const EMPTY: MemoState = { folders: [keepFolder()] };
let cacheRaw: string | null | undefined, cache: MemoState = EMPTY;

/** Normalise: Keep always exists and comes first. */
function norm(v: any): MemoState {
  const fs: Folder[] = v && Array.isArray(v.folders) ? v.folders.filter((f: any) => f && f.id) : [];
  const keep = fs.find((f) => f.id === KEEP);
  const rest = fs.filter((f) => f.id !== KEEP).map((f) => ({ ...f, notes: f.notes || [], keep: undefined }));
  return { folders: [{ ...keepFolder(), ...(keep || {}), name: 'Keep', keep: true, notes: keep?.notes || [], items: keep?.items || [] }, ...rest] };
}

export function getMemo(): MemoState {
  if (typeof window === 'undefined') return EMPTY;
  const raw = localStorage.getItem(K);
  if (raw !== cacheRaw) { cacheRaw = raw; try { cache = norm(JSON.parse(raw || 'null')); } catch { cache = EMPTY; } }
  return cache;
}
const toast = (m: string) => window.dispatchEvent(new CustomEvent('m3x-toast', { detail: m }));
function save(s: MemoState) {
  try { localStorage.setItem(K, JSON.stringify(s)); }
  catch { toast('保存容量がいっぱいです（参照ポストを減らしてください）'); return false; }
  window.dispatchEvent(new Event(EV)); return true;
}
export const useMemo2 = () => useLocal(EV, getMemo, EMPTY);
/** Create the Keep folder on first load. */
export function ensureKeep() { if (typeof window !== 'undefined' && !(localStorage.getItem(K) || '').includes(`"id":"${KEEP}"`)) save(getMemo()); }

export const memoOn = () => typeof window !== 'undefined' && localStorage.getItem(ON) === '1';
export function setMemoOn(v: boolean) { if (v) localStorage.setItem(ON, '1'); else localStorage.removeItem(ON); window.dispatchEvent(new Event(EV)); }
export const useMemoOn = () => useLocal(EV, memoOn, false);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mapF = (fid: string, f: (x: Folder) => Folder) => save({ folders: getMemo().folders.map((x) => (x.id === fid ? f(x) : x)) });
const mapN = (fid: string, nid: string, f: (n: Note) => Note) => mapF(fid, (x) => ({ ...x, notes: x.notes.map((n) => (n.id === nid ? { ...f(n), updated: Date.now() } : n)) }));
const itemKey = (i: Pick<Item, 'src' | 'media'>) => i.src.id + (i.media ? '|' + i.media.url : '');

export const memo = {
  addFolder(name: string) { const f: Folder = { id: uid(), name: name.trim() || '新しいフォルダ', notes: [], items: [], created: Date.now() }; save({ folders: [...getMemo().folders, f] }); return f.id; },
  renameFolder: (fid: string, name: string) => fid !== KEEP && name.trim() && mapF(fid, (x) => ({ ...x, name: name.trim() })),
  delFolder: (fid: string) => fid !== KEEP && save({ folders: getMemo().folders.filter((x) => x.id !== fid) }),
  addNote(fid: string, p: Partial<Note> = {}) { const n: Note = { id: uid(), title: '', body: '', sources: [], created: Date.now(), updated: Date.now(), ...p }; mapF(fid, (x) => ({ ...x, notes: [n, ...x.notes] })); return n.id; },
  editNote: (fid: string, nid: string, p: Partial<Note>) => mapN(fid, nid, (n) => ({ ...n, ...p })),
  delNote: (fid: string, nid: string) => mapF(fid, (x) => ({ ...x, notes: x.notes.filter((n) => n.id !== nid) })),
  delSource: (fid: string, nid: string, sid: string) => mapN(fid, nid, (n) => ({ ...n, sources: n.sources.filter((s) => s.id !== sid) })),
  /** Attach a post; toasts the outcome. */
  addSource(fid: string, nid: string, s: Src) {
    const n = getMemo().folders.find((x) => x.id === fid)?.notes.find((x) => x.id === nid);
    if (!n) return;
    if (n.sources.some((x) => x.id === s.id)) return toast('このポストは追加済みです');
    if (n.sources.length >= MAX_SRC) return toast(`参照ポストは最大${MAX_SRC}件までです`);
    if (mapN(fid, nid, (x) => ({ ...x, sources: [...x.sources, s] }))) toast(`「${n.title || '無題のノート'}」に追加しました（${n.sources.length + 1}/${MAX_SRC}）`);
  },
  /** Save a post or one media item into a folder (Keep by default). */
  addItem(d: Drop, fid = KEEP, quiet = false) {
    const f = getMemo().folders.find((x) => x.id === fid); if (!f) return false;
    const it: Item = { id: uid(), src: d.src, media: d.media, added: Date.now() };
    if ((f.items || []).some((x) => itemKey(x) === itemKey(it))) { if (!quiet) toast(`${f.name} に保存済みです`); return false; }
    const ok = mapF(fid, (x) => ({ ...x, items: [it, ...(x.items || [])] }));
    if (ok && !quiet) toast(`${d.media ? (d.media.type === 'photo' ? '画像' : d.media.type === 'gif' ? 'GIF' : '動画') : 'ポスト'}を ${f.name} に保存しました`);
    return ok;
  },
  /** Is this post (whole post, not a single media item) saved in Keep? */
  isKept: (postId: string) => !!getMemo().folders[0]?.items?.some((i) => !i.media && i.src.id === postId),
  /** Remove a whole-post save from Keep. */
  unkeep: (postId: string) => mapF(KEEP, (x) => ({ ...x, items: (x.items || []).filter((i) => i.media || i.src.id !== postId) })),
  delItem: (fid: string, iid: string) => mapF(fid, (x) => ({ ...x, items: (x.items || []).filter((i) => i.id !== iid) })),
  /** Move items between folders in one write. */
  moveItems(ids: string[], to: string) {
    const st = getMemo(); const set = new Set(ids); const moved: Item[] = [];
    let fs = st.folders.map((f) => { const keep = (f.items || []).filter((i) => { if (set.has(i.id) && f.id !== to) { moved.push(i); return false; } return true; }); return { ...f, items: keep }; });
    fs = fs.map((f) => (f.id === to ? { ...f, items: [...moved.filter((m) => !(f.items || []).some((x) => itemKey(x) === itemKey(m))), ...(f.items || [])] } : f));
    return save({ folders: fs }) ? moved.length : 0;
  },
};

/* ---------- undo for the last agent batch ---------- */
export function snapshot() { try { localStorage.setItem(UNDO, localStorage.getItem(K) || JSON.stringify(getMemo())); } catch {} }
export function undo() {
  const v = localStorage.getItem(UNDO); if (!v) return false;
  try { localStorage.setItem(K, v); localStorage.removeItem(UNDO); } catch { return false; }
  window.dispatchEvent(new Event(EV)); return true;
}
export const clearUndo = () => localStorage.removeItem(UNDO);

/* ---------- drag & drop ---------- */
export interface Drop { src: Src; media?: KMedia }
export const snap = (t: XTweet): Src => {
  const m = t.media[0];
  return { id: t.id, handle: t.user.handle, name: t.user.name, avatar: t.user.avatar, text: Array.from(t.text).slice(0, 400).join(''), image: m ? (m.type === 'photo' ? m.url : m.thumb) : t.card?.image, at: t.createdAt };
};
export const kmedia = (m: XMedia): KMedia => ({ type: m.type, url: m.type === 'photo' ? m.url : m.thumb || m.url, thumb: m.thumb, video: m.video, w: m.w, h: m.h });
export const hasDrop = (e: React.DragEvent) => { const t = Array.from(e.dataTransfer.types); return t.includes(MIME) || t.includes(MIME_MEDIA); };
/** Reads a dragged post or media item. */
export function readDrop2(e: React.DragEvent): Drop | null {
  try { const m = e.dataTransfer.getData(MIME_MEDIA); if (m) { const d = JSON.parse(m); if (d?.src?.id) return d; } } catch {}
  try { const s = JSON.parse(e.dataTransfer.getData(MIME)); return s && s.id ? { src: s } : null; } catch { return null; }
}
export const pickMemo = (s: Src) => window.dispatchEvent(new CustomEvent('m3x-memo-pick', { detail: s }));

/* ---------- tweet -> Src registry (lets the Actions executor resolve a
   rendered post back to its Src for drag-to-Keep) ---------- */
const srcReg = new Map<string, Src>();
export function registerSrc(s: Src) { if (srcReg.size > 400) srcReg.clear(); srcReg.set(s.id, s); }
export const srcById = (id: string) => srcReg.get(id);

/* ---------- EX Agent context posts (persisted so mobile "add" works before the panel mounts) ---------- */
export const MAX_CTX = 7;
const AK = 'm3x.agentCtx', AEV = 'm3x-agentctx';
let ctxCache: Src[] = [];
let ctxDirty = true; // cache may lag localStorage (first read, or a write from another tab)
const NO_CTX: Src[] = [];
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === AK || e.key === null) ctxDirty = true; });
export function getCtx(): Src[] {
  if (typeof window === 'undefined') return NO_CTX;
  if (ctxDirty) {
    ctxDirty = false;
    try { const v = JSON.parse(localStorage.getItem(AK) || '[]'); ctxCache = Array.isArray(v) ? v : []; } catch { ctxCache = []; }
  }
  return ctxCache;
}
export const useCtx = () => useLocal(AEV, getCtx, NO_CTX);
/** Write-through save: the in-memory cache is replaced BEFORE persisting, so
    getCtx() can never hand out pre-delete data once a delete has returned. */
function saveCtx(v: Src[]) {
  ctxCache = v; ctxDirty = false;
  try { localStorage.setItem(AK, JSON.stringify(v)); } catch {}
  window.dispatchEvent(new Event(AEV));
}
/** Add a context post: dedupes and enforces the 7-post limit with a toast. */
export function addCtx(s: Src, quiet = false) {
  const c = getCtx();
  if (c.some((x) => x.id === s.id)) { toast('このポストはコンテキストに追加済みです'); return false; }
  if (c.length >= MAX_CTX) { toast(`コンテキストは最大${MAX_CTX}件までです`); return false; }
  saveCtx([...c, s]); if (!quiet) toast(`EX Agent に追加しました（${c.length + 1}/${MAX_CTX}）`); return true;
}
export const delCtx = (id: string) => saveCtx(getCtx().filter((x) => x.id !== id));
/** Remove ALL context posts: drop the persisted key entirely (not just an
    empty array) and reset the cache, so nothing of the old context remains. */
export const clearCtx = () => {
  ctxCache = []; ctxDirty = false;
  try { localStorage.removeItem(AK); } catch {}
  window.dispatchEvent(new Event(AEV));
};
