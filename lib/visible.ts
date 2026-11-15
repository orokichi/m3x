'use client';
import { useEffect, useRef, useState } from 'react';
import { snap, type Src } from './memo';
import { pickVisible } from './aiPrompts';
import type { XTweet } from './types';

/* Registry of mounted TweetCards so Groq can use "the posts on screen" as context.
   Read fresh at send time (never a stale snapshot). */
const reg = new Map<Element, XTweet>();
export function useVisibleReg<T extends Element>(t: XTweet) {
  const ref = useRef<T>(null);
  useEffect(() => { const el = ref.current; if (!el) return; reg.set(el, t); return () => { reg.delete(el); }; }, [t]);
  return ref;
}
const inPanel = (el: Element) => !!el.closest('.rightbar,.dialog,.sp');
const cards = (scope?: Element | null) => [...reg].filter(([el]) => el.isConnected && !inPanel(el) && (!scope || scope.contains(el))).map(([el, t]) => { const r = el.getBoundingClientRect(); return { el, t, r }; });

/** Posts currently visible in the viewport (max 7, top→bottom). */
export function getVisible(max = 7): Src[] {
  if (typeof window === 'undefined') return [];
  return pickVisible(cards().map(({ t, r }) => ({ src: snap(t), top: r.top, bottom: r.bottom, left: r.left })), window.innerHeight, max);
}
/** Posts loaded "so far": everything above the bottom of the viewport (optionally inside one deck column). */
export function getSoFar(scope?: Element | null, cap = 30): XTweet[] {
  if (typeof window === 'undefined') return [];
  const vb = scope ? scope.getBoundingClientRect().bottom : window.innerHeight;
  const seen = new Set<string>();
  return cards(scope).filter(({ r }) => r.top < vb && r.height > 0).sort((a, b) => a.r.top - b.r.top)
    .map(({ t }) => t).filter((t) => !seen.has(t.id) && !!seen.add(t.id)).slice(-cap);
}
/** Re-renders on scroll/resize (throttled) with the visible posts. */
export function useVisible(on = true) {
  const [v, setV] = useState<Src[]>([]);
  useEffect(() => {
    if (!on) { setV([]); return; }
    let raf = 0, t = 0;
    const upd = () => { raf = 0; const n = getVisible(); setV((o) => (o.length === n.length && o.every((s, i) => s.id === n[i].id) ? o : n)); };
    const f = () => { if (!raf) raf = requestAnimationFrame(upd); };
    const onScroll = () => { clearTimeout(t); t = window.setTimeout(f, 120); };
    upd(); window.addEventListener('scroll', onScroll, { passive: true, capture: true }); window.addEventListener('resize', onScroll);
    const iv = window.setInterval(f, 1500);
    return () => { window.removeEventListener('scroll', onScroll, { capture: true } as any); window.removeEventListener('resize', onScroll); clearInterval(iv); clearTimeout(t); if (raf) cancelAnimationFrame(raf); };
  }, [on]);
  return v;
}
