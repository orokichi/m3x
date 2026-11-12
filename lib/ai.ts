'use client';
import { useSyncExternalStore } from 'react';
import type { XTweet } from './types';

/* Groq API key: kept only in this browser (localStorage), sent per request via header. */
const K = 'm3x.groq';
export const getGroqKey = () => (typeof window === 'undefined' ? '' : localStorage.getItem(K) || '');
export function setGroqKey(k: string) {
  if (k) localStorage.setItem(K, k); else localStorage.removeItem(K);
  window.dispatchEvent(new Event('m3x-groq'));
}

/** Subscribe to a localStorage-backed value (re-read on custom event + cross-tab storage). */
export function useLocal<T>(ev: string, get: () => T, server: T): T {
  return useSyncExternalStore(
    (cb) => { window.addEventListener(ev, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(ev, cb); window.removeEventListener('storage', cb); }; },
    get, () => server,
  );
}
export const useGroq = () => useLocal('m3x-groq', () => !!getGroqKey(), false);

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

/** tier "small" = fast/cheap model for rewriting; "large" = better model for final answers. */
export async function groq(messages: Msg[], o: { tier?: 'small' | 'large'; max?: number; json?: boolean; temperature?: number } = {}): Promise<string> {
  const key = getGroqKey();
  if (!key) throw new Error('設定で Groq の API キーを登録してください');
  let r: Response;
  try {
    r = await fetch('/api/ai', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-groq-key': key },
      body: JSON.stringify({ tier: o.tier || 'small', messages, max_tokens: o.max ?? 300, json: !!o.json, temperature: o.temperature ?? 0.3 }),
    });
  } catch { throw new Error('ネットワークエラーです'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `AIエラー (${r.status})`);
  return String(j.text || '');
}

export function parseJson<T = any>(t: string): T | null {
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

/** Compact, numbered post list for prompts (keeps tokens low). */
export const compact = (ts: XTweet[], cap = 30, len = 140) => ts.slice(0, cap).map((t, i) => {
  const d = new Date(t.createdAt);
  const s = t.text.replace(/https?:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim();
  return `[${i + 1}] @${t.user.handle} ${d.getMonth() + 1}/${d.getDate()}: ${Array.from(s).slice(0, len).join('')}${t.media.length ? ' [画像]' : ''} ♥${t.likes}`;
}).join('\n');
