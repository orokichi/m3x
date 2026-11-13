'use client';
import { img } from './api';

/* Lightweight media system: right-sized pbs.twimg.com variants (webp), one shared IntersectionObserver for lazy loading. */
const SIZED = /^https:\/\/pbs\.twimg\.com\/(media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//;

/** Proxied URL for the smallest X variant that covers `px` device pixels on the long side. */
export function variant(u: string | undefined, px: number) {
  if (!u) return '';
  if (SIZED.test(u) && !u.includes('?')) {
    // small ≤680, medium ≤1200, large ≤2048 (webp). `orig` is not served as webp, so it is left to the lightbox.
    const name = px <= 680 ? 'small' : px <= 1200 ? 'medium' : 'large';
    u = `${u.replace(/\.(jpe?g|png|webp)$/i, '')}?format=webp&name=${name}`;
  }
  return img(u);
}

/** Device pixels needed for an element's long side. */
export const needPx = (el: Element) => { const r = el.getBoundingClientRect(); return Math.ceil(Math.max(r.width, r.height, 1) * Math.min(window.devicePixelRatio || 1, 3)); };

type Cb = () => void;
const cbs = new WeakMap<Element, Cb>();
let io: IntersectionObserver | null = null;
/** Calls `cb` once when `el` comes within ~1 screen of the viewport. Returns an unsubscribe. */
export function whenNear(el: Element, cb: Cb) {
  if (typeof IntersectionObserver === 'undefined') { cb(); return () => {}; }
  io ||= new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { const f = cbs.get(e.target); io!.unobserve(e.target); cbs.delete(e.target); f?.(); }
  }, { rootMargin: '900px 0px' });
  cbs.set(el, cb); io.observe(el);
  return () => { cbs.delete(el); io?.unobserve(el); };
}
