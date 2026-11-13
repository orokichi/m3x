'use client';
import { useId } from 'react';

/**
 * "groq" wordmark drawn as rounded geometric strokes (lowercase).
 * Tinted from the live Material theme tokens: primary → tertiary tonal
 * gradient, so it follows the chosen theme colour and light/dark mode.
 * `compact` renders just the "g" glyph for small icon slots;
 * `mono` paints with currentColor (e.g. on a filled primary surface).
 * `size` is the rendered height in px.
 */
export default function GroqMark({ size = 20, compact, mono, title }: { size?: number; compact?: boolean; mono?: boolean; title?: string }) {
  const id = 'gq' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const ink = mono ? 'currentColor' : `url(#${id})`;
  const s = { stroke: ink, strokeWidth: 7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const vb = compact ? '-1 3 27 37' : '-1 3 97 37';
  const w = compact ? 27 : 97;
  return (
    <svg className="groq-mark" width={(size * w) / 37} height={size} viewBox={vb} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false" style={{ flexShrink: 0, display: 'block', overflow: 'visible' }}>
      {!mono && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2={w} y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--md-primary)' }} />
            <stop offset="1" style={{ stopColor: compact ? 'var(--md-primary)' : 'var(--md-tertiary)' }} />
          </linearGradient>
        </defs>
      )}
      {/* g */}
      <circle cx="12" cy="17" r="9" {...s} />
      <path d="M21 8V27a9 9 0 0 1-16.6 4.8" {...s} />
      {!compact && <>
        {/* r */}
        <path d="M33 26V17a9 9 0 0 1 9-9" {...s} />
        {/* o */}
        <circle cx="57" cy="17" r="9" {...s} />
        {/* q */}
        <circle cx="80" cy="17" r="9" {...s} />
        <path d="M89 8V35" {...s} />
      </>}
    </svg>
  );
}
