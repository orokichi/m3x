'use client';
export interface Creds { authToken?: string; ct0?: string; twid?: string; apiKey?: string }
const KEY = 'm3x.creds';

export function getCreds(): Creds | null {
  if (typeof window === 'undefined') return null;
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && (c.apiKey || (c.authToken && c.ct0)) ? c : null; } catch { return null; }
}
export function setCreds(c: Creds | null) {
  if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('m3x-auth'));
}

export class ApiError extends Error { constructor(public code: string, msg: string) { super(msg); } }

export async function x<T = any>(op: string, args: Record<string, any> = {}): Promise<T> {
  const c = getCreds();
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (c?.apiKey) h['x-api-key'] = c.apiKey;
  else if (c) { h['x-auth-token'] = c.authToken!; h['x-ct0'] = c.ct0!; if (c.twid) h['x-twid'] = c.twid; }
  let res: Response;
  try { res = await fetch('/api/x', { method: 'POST', headers: h, body: JSON.stringify({ op, ...args }) }); }
  catch { throw new ApiError('network', 'ネットワークエラーです。接続を確認してください。'); }
  const j = await res.json().catch(() => ({ error: { code: 'error', msg: `サーバーエラー (${res.status})` } }));
  if (j.error) {
    if (j.error.code === 'auth') window.dispatchEvent(new CustomEvent('m3x-autherr'));
    throw new ApiError(j.error.code, j.error.msg);
  }
  return j.data as T;
}

export function toast(msg: string) { window.dispatchEvent(new CustomEvent('m3x-toast', { detail: msg })); }

export const fmtNum = (n?: number) => {
  if (n == null) return '';
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '億';
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
  return n.toLocaleString('ja-JP');
};
export const fmtTime = (iso: string) => {
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return `${Math.max(1, Math.floor(s))}秒`;
  if (s < 3600) return `${Math.floor(s / 60)}分`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間`;
  const y = d.getFullYear() === new Date().getFullYear();
  return `${y ? '' : d.getFullYear() + '年'}${d.getMonth() + 1}月${d.getDate()}日`;
};
export const fmtFull = (iso: string) => new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Resize an image file to a JPEG data URL (keeps uploads under serverless body limits). */
export function shrink(file: File, max = 2048): Promise<string> {
  return new Promise((ok, ng) => {
    if (file.type === 'image/gif' && file.size < 3e6) { const fr = new FileReader(); fr.onload = () => ok(fr.result as string); fr.onerror = ng; fr.readAsDataURL(file); return; }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.85)); URL.revokeObjectURL(img.src);
    };
    img.onerror = ng; img.src = URL.createObjectURL(file);
  });
}

/* Local (guest-mode) follows, stored only in this browser. */
export interface LocalFollow { id: string; handle: string; name: string; avatar?: string }
const FKEY = 'm3x.follows';
export function getFollows(): LocalFollow[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(FKEY) || '[]'); } catch { return []; }
}
export const isLocalFollow = (id: string) => getFollows().some((f) => f.id === id);
export function setLocalFollow(u: { id: string; handle: string; name: string; avatar?: string }, on: boolean) {
  const l = getFollows().filter((f) => f.id !== u.id);
  if (on) l.unshift({ id: u.id, handle: u.handle, name: u.name, avatar: u.avatar });
  localStorage.setItem(FKEY, JSON.stringify(l));
  window.dispatchEvent(new Event('m3x-follows'));
}

/** Proxy X images through our server (works where pbs.twimg.com is blocked). */
export const img = (u?: string, name?: string) => {
  if (!u) return '';
  let s = u;
  if (name && /pbs\.twimg\.com\/media\//.test(s) && !s.includes('?')) {
    const m = s.match(/^(.*)\.(jpg|jpeg|png|webp)$/);
    s = m ? `${m[1]}?format=${m[2] === 'jpeg' ? 'jpg' : m[2]}&name=${name}` : `${s}?name=${name}`;
  }
  return /^https:\/\/(pbs|abs|ton)\.twimg\.com\//.test(s) ? `/api/img?u=${encodeURIComponent(s)}` : s;
};
