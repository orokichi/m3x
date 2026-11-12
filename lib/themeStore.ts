'use client';
import { useLocal } from './ai';

/* Theme seed + cached scheme CSS (so first paint needs no color math). */
const SK = 'm3x.seed', CK = 'm3x.themeCss', EV = 'm3x-theme';
export const DEFAULT_SEED = '#1d9bf0';
export const PRESETS: [string, string][] = [
  ['#1d9bf0', 'ブルー'], ['#6750a4', 'パープル'], ['#d0458f', 'ピンク'], ['#c4352b', 'レッド'], ['#e8730c', 'オレンジ'],
  ['#c9a400', 'イエロー'], ['#2e8b57', 'グリーン'], ['#00897b', 'ティール'], ['#5c6bc0', 'インディゴ'], ['#6d6d6d', 'グレー'],
];
export const getSeedPref = () => (typeof window === 'undefined' ? DEFAULT_SEED : localStorage.getItem(SK) || DEFAULT_SEED);
export const useSeedPref = () => useLocal(EV, getSeedPref, DEFAULT_SEED);

/** "system" → the OS accent colour when the browser exposes it (CSS AccentColor), else the default. */
export function resolveSeed(pref: string) {
  if (pref !== 'system') return pref;
  try {
    if (!CSS.supports('color', 'AccentColor')) return DEFAULT_SEED;
    const el = document.createElement('i'); el.style.color = 'AccentColor'; el.style.display = 'none'; document.body.appendChild(el);
    const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g); el.remove();
    if (!m) return DEFAULT_SEED;
    return '#' + m.slice(0, 3).map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('');
  } catch { return DEFAULT_SEED; }
}

const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
function inject(css: string, dark: boolean) {
  let el = document.getElementById('m3-theme') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'm3-theme'; document.head.appendChild(el); }
  el.textContent = `:root:root{${css}color-scheme:${dark ? 'dark' : 'light'}}`;
  document.documentElement.dataset.dark = dark ? '1' : '0';
  const bg = css.match(/--md-surface:(#[0-9a-f]+)/i)?.[1];
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta && bg) meta.setAttribute('content', bg);
}

/** Apply the theme; computes the scheme lazily only when the cache doesn't match the seed. */
export async function applyTheme() {
  const seed = resolveSeed(getSeedPref()), dark = isDark();
  let c: any = null; try { c = JSON.parse(localStorage.getItem(CK) || 'null'); } catch {}
  if (!c || c.seed !== seed) {
    const { schemeCss } = await import('./theme');
    c = { seed, light: schemeCss(seed, false), dark: schemeCss(seed, true) };
    try { localStorage.setItem(CK, JSON.stringify(c)); } catch {}
  }
  inject(dark ? c.dark : c.light, dark);
}
export function setSeedPref(v: string) { localStorage.setItem(SK, v); window.dispatchEvent(new Event(EV)); applyTheme(); }

