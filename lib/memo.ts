'use client';
import { useLocal } from './ai';
import type { XTweet } from './types';

export const MIME = 'application/x-m3x-post';
export const MAX_SRC = 30;
export interface Src { id: string; handle: string; name: string; avatar?: string; text: string; image?: string; at?: string }
export interface Note { id: string; title: string; body: string; place?: string; sources: Src[]; created: number; updated: number }
export interface Folder { id: string; name: string; notes: Note[]; created: number }
export interface MemoState { folders: Folder[] }

const K = 'm3x.memo', ON = 'm3x.memoOn', EV = 'm3x-memo';
const EMPTY: MemoState = { folders: [] };
let cacheRaw: string | null | undefined, cache: MemoState = EMPTY;

export function getMemo(): MemoState {
  if (typeof window === 'undefined') return EMPTY;
  const raw = localStorage.getItem(K);
  if (raw !== cacheRaw) { cacheRaw = raw; try { const v = JSON.parse(raw || 'null'); cache = v && Array.isArray(v.folders) ? v : EMPTY; } catch { cache = EMPTY; } }
  return cache;
}
function save(s: MemoState) {
  try { localStorage.setItem(K, JSON.stringify(s)); }
  catch { window.dispatchEvent(new CustomEvent('m3x-toast', { detail: '保存容量がいっぱいです（参照ポストを減らしてください）' })); return false; }
  window.dispatchEvent(new Event(EV)); return true;
}
export const useMemo2 = () => useLocal(EV, getMemo, EMPTY);

export const memoOn = () => typeof window !== 'undefined' && localStorage.getItem(ON) === '1';
export function setMemoOn(v: boolean) { if (v) localStorage.setItem(ON, '1'); else localStorage.removeItem(ON); window.dispatchEvent(new Event(EV)); }
export const useMemoOn = () => useLocal(EV, memoOn, false);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mapF = (fid: string, f: (x: Folder) => Folder) => save({ folders: getMemo().folders.map((x) => (x.id === fid ? f(x) : x)) });
const mapN = (fid: string, nid: string, f: (n: Note) => Note) => mapF(fid, (x) => ({ ...x, notes: x.notes.map((n) => (n.id === nid ? { ...f(n), updated: Date.now() } : n)) }));

export const memo = {
  addFolder(name: string) { const f: Folder = { id: uid(), name: name.trim() || '新しいフォルダ', notes: [], created: Date.now() }; save({ folders: [...getMemo().folders, f] }); return f.id; },
  renameFolder: (fid: string, name: string) => name.trim() && mapF(fid, (x) => ({ ...x, name: name.trim() })),
  delFolder: (fid: string) => save({ folders: getMemo().folders.filter((x) => x.id !== fid) }),
  addNote(fid: string) { const n: Note = { id: uid(), title: '', body: '', sources: [], created: Date.now(), updated: Date.now() }; mapF(fid, (x) => ({ ...x, notes: [n, ...x.notes] })); return n.id; },
  editNote: (fid: string, nid: string, p: Partial<Note>) => mapN(fid, nid, (n) => ({ ...n, ...p })),
  delNote: (fid: string, nid: string) => mapF(fid, (x) => ({ ...x, notes: x.notes.filter((n) => n.id !== nid) })),
  delSource: (fid: string, nid: string, sid: string) => mapN(fid, nid, (n) => ({ ...n, sources: n.sources.filter((s) => s.id !== sid) })),
  /** Attach a post; toasts the outcome. */
  addSource(fid: string, nid: string, s: Src) {
    const n = getMemo().folders.find((x) => x.id === fid)?.notes.find((x) => x.id === nid);
    const t = (m: string) => window.dispatchEvent(new CustomEvent('m3x-toast', { detail: m }));
    if (!n) return;
    if (n.sources.some((x) => x.id === s.id)) return t('このポストは追加済みです');
    if (n.sources.length >= MAX_SRC) return t(`参照ポストは最大${MAX_SRC}件までです`);
    if (mapN(fid, nid, (x) => ({ ...x, sources: [...x.sources, s] }))) t(`「${n.title || '無題のメモ'}」に追加しました（${n.sources.length + 1}/${MAX_SRC}）`);
  },
};

export const snap = (t: XTweet): Src => {
  const m = t.media[0];
  return { id: t.id, handle: t.user.handle, name: t.user.name, avatar: t.user.avatar, text: Array.from(t.text).slice(0, 400).join(''), image: m ? (m.type === 'photo' ? m.url : m.thumb) : t.card?.image, at: t.createdAt };
};
export function readDrop(e: React.DragEvent): Src | null {
  try { const s = JSON.parse(e.dataTransfer.getData(MIME)); return s && s.id ? s : null; } catch { return null; }
}
export const pickMemo = (s: Src) => window.dispatchEvent(new CustomEvent('m3x-memo-pick', { detail: s }));
