'use client';
import { useExMouse } from '@/lib/actions';

/** EX Mouse: the Agent's virtual cursor. Spring-eased glide, click ripple,
    scroll cue and drag trail. Purely visual (pointer-events: none). */
export default function ExMouse() {
  const m = useExMouse();
  if (!m.on) return null;
  return (
    <>
      {m.drag && (
        <svg className="exm-trail" aria-hidden="true" width="100%" height="100%">
          <line x1={m.drag.x} y1={m.drag.y} x2={m.x} y2={m.y} style={{ transitionDuration: `${m.dur}ms` }} />
          <circle cx={m.drag.x} cy={m.drag.y} r="6" />
        </svg>
      )}
      {m.ripple && <span key={m.ripple.k} className="exm-ripple" style={{ left: m.ripple.x, top: m.ripple.y }} aria-hidden="true" />}
      <div className={'exm' + (m.drag ? ' drag' : '') + (typeof window !== 'undefined' && m.x > window.innerWidth - 240 ? ' flip' : '')} style={{ transform: `translate3d(${m.x}px, ${m.y}px, 0)`, transitionDuration: `${m.dur}ms` }} aria-hidden="true">
        <span className="exm-cur" key={m.press}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5.2 3.4 19 11.8c.5.3.4 1-.1 1.2l-6.2 1.7-2.3 5.9c-.2.5-1 .5-1.3 0L6.6 14 3.9 17c-.4.4-1.1.2-1.2-.4L4 4.2c.1-.6.7-1 1.2-.8Z" fill="var(--md-primary)" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </span>
        {m.drag && <span className="exm-ghost"><span className="ms" style={{ fontSize: 16 }}>article</span>ポスト</span>}
        {m.scroll && <span className={'exm-scroll ' + m.scroll}><i /><i /><i /></span>}
        {m.label && <span className="exm-label">{m.label}</span>}
      </div>
    </>
  );
}
