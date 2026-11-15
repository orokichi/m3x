'use client';
import { useLocal } from './ai';

/* Multi-column (TweetDeck-style) layout settings, kept in this browser only. */
export type ColType = 'home' | 'following' | 'search' | 'list' | 'user' | 'notifications' | 'keep';
export interface Col { id: string; type: ColType; q?: string; handle?: string; list?: string; name?: string }
export interface Deck { on: boolean; cols: Col[]; width?: number }
export const COL_META: Record<ColType, [string, string]> = {
  home: ['home', 'ホーム'], following: ['group', 'フォロー中'], search: ['search', '検索'], list: ['list_alt', 'リスト'],
  user: ['person', 'ユーザー'], notifications: ['notifications', '通知'], keep: ['bookmarks', 'Keep'],
};
export const DECK_MIN = 1600;
const K = 'm3x.deck', EV = 'm3x-deck';
const uid = () => Math.random().toString(36).slice(2, 9);
const DEFAULT: Deck = { on: false, cols: [{ id: 'c-home', type: 'home' }, { id: 'c-follow', type: 'following' }, { id: 'c-keep', type: 'keep' }] };
let cacheRaw: string | null | undefined; let cacheVal: Deck = DEFAULT;
export function getDeck(): Deck {
  if (typeof window === 'undefined') return DEFAULT;
  const raw = localStorage.getItem(K);
  if (raw !== cacheRaw) { cacheRaw = raw; try { const v = raw ? JSON.parse(raw) : null; cacheVal = v && Array.isArray(v.cols) ? { on: !!v.on, cols: v.cols.slice(0, 12), width: v.width } : DEFAULT; } catch { cacheVal = DEFAULT; } }
  return cacheVal;
}
function save(d: Deck) { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* ignore */ } window.dispatchEvent(new Event(EV)); }
export const useDeck = () => useLocal(EV, getDeck, DEFAULT);
export const deck = {
  setOn: (on: boolean) => save({ ...getDeck(), on }),
  setWidth: (width: number) => save({ ...getDeck(), width }),
  add: (c: Omit<Col, 'id'>) => save({ ...getDeck(), cols: [...getDeck().cols, { ...c, id: uid() }].slice(0, 12) }),
  remove: (id: string) => save({ ...getDeck(), cols: getDeck().cols.filter((c) => c.id !== id) }),
  move: (id: string, d: -1 | 1) => { const cols = [...getDeck().cols]; const i = cols.findIndex((c) => c.id === id), j = i + d; if (i < 0 || j < 0 || j >= cols.length) return; [cols[i], cols[j]] = [cols[j], cols[i]]; save({ ...getDeck(), cols }); },
  reset: () => save({ ...DEFAULT, on: getDeck().on }),
};
export const colTitle = (c: Col) => c.name || (c.type === 'search' ? `検索: ${c.q}` : c.type === 'user' ? `@${c.handle}` : COL_META[c.type][1]);
