'use client';
import { useEffect, useRef, useState } from 'react';
import { variant, needPx, whenNear } from '@/lib/media';

/** Lazy, right-sized X image. Fills its (sized) parent; shows a colour/blur placeholder until decoded. */
export function Img({ src, color, alt = '', className = '', fit }: { src?: string; color?: string; alt?: string; className?: string; fit?: 'cover' | 'contain' }) {
  const box = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState('');
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el || !src) return;
    setOk(false); setUrl('');
    return whenNear(el, () => setUrl(variant(src, needPx(el))));
  }, [src]);
  return (
    <span ref={box} className={'mimg' + (ok ? ' ld' : '') + (className ? ' ' + className : '')} style={color ? { background: color } : undefined}>
      {url && <img src={url} alt={alt} decoding="async" referrerPolicy="no-referrer" draggable={false} style={fit ? { objectFit: fit } : undefined}
        onLoad={() => setOk(true)} onError={() => setOk(true)} />}
    </span>
  );
}

/** Video that only fetches its poster when near the viewport and nothing else until played. */
export function LazyVideo({ m, fit }: { m: { video?: string; thumb?: string; type: string; c?: string }; fit?: 'cover' | 'contain' }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [poster, setPoster] = useState('');
  const [near, setNear] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; return whenNear(el, () => { setPoster(variant(m.thumb, needPx(el))); setNear(true); }); }, [m.thumb]);
  const gif = m.type === 'gif';
  return <video ref={ref} src={near ? m.video : undefined} poster={poster || undefined} controls={!gif} autoPlay={gif && near} loop={gif} muted={gif} playsInline preload="none"
    style={{ objectFit: fit || 'cover', background: m.c || '#000' }} />;
}
