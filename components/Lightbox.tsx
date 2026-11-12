'use client';
import { useEffect, useState } from 'react';
import { img } from '@/lib/api';
import { Icon } from './ui';

/** Lazy-loaded image viewer (photos) or single video. */
export default function Lightbox({ urls, start = 0, video, onClose }: { urls: string[]; start?: number; video?: { src: string; poster?: string; gif?: boolean }; onClose: () => void }) {
  const [i, setI] = useState(Math.max(0, start));
  const n = urls.length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (n > 1 && e.key === 'ArrowRight') setI((v) => (v + 1) % n); if (n > 1 && e.key === 'ArrowLeft') setI((v) => (v + n - 1) % n); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [n, onClose]);
  return (
    <div className="lightbox" onClick={(e) => { e.stopPropagation(); onClose(); }} role="dialog" aria-label="メディア">
      {video ? <video src={video.src} poster={video.poster ? img(video.poster, 'small') : undefined} controls={!video.gif} autoPlay loop={video.gif} muted={video.gif} playsInline onClick={(e) => e.stopPropagation()} />
        : <img src={img(urls[i], 'orig')} alt="" referrerPolicy="no-referrer" />}
      <button className="icon-btn lb-x" aria-label="閉じる"><Icon n="close" /></button>
      {!video && n > 1 && <>
        <button className="icon-btn lb-p" aria-label="前へ" onClick={(e) => { e.stopPropagation(); setI((i + n - 1) % n); }}><Icon n="chevron_left" /></button>
        <button className="icon-btn lb-n" aria-label="次へ" onClick={(e) => { e.stopPropagation(); setI((i + 1) % n); }}><Icon n="chevron_right" /></button>
      </>}
    </div>
  );
}
