'use client';
import { useMouse } from '@/lib/uiactions';

/**
 * M3X Mouse: the AI virtual cursor. Rendered above everything
 * (pointer-events: none), it glides with an M3 spring to wherever the
 * Agent is acting, shows a label chip describing the current action,
 * and squashes + pings when it "clicks".
 */
export default function M3xMouse() {
  const m = useMouse();
  if (!m.on) return null;
  return (
    <div className={'mx-mouse' + (m.press ? ' press' : '') + (m.drag ? ' drag' : '')}
      style={{ transform: `translate3d(${m.x}px, ${m.y}px, 0)`, transitionDuration: `${m.dur}ms` }} aria-hidden="true">
      <span className="mx-mouse-cur">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path d="M5.2 3.4 19 11.8c.5.3.4 1-.1 1.2l-6.2 1.7-2.3 5.9c-.2.5-1 .5-1.3 0L6.6 14 3.9 17c-.4.4-1.1.2-1.2-.4L4 4.2c.1-.6.7-1 1.2-.8Z" transform="translate(1.5 0) scale(.92)" fill="var(--md-primary)" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M20.8 1.6c.2 1.2.5 1.5 1.7 1.7-1.2.2-1.5.5-1.7 1.7-.2-1.2-.5-1.5-1.7-1.7 1.2-.2 1.5-.5 1.7-1.7Z" fill="var(--md-primary)" />
        </svg>
      </span>
      {m.label && <span className="mx-mouse-label">{m.label}</span>}
    </div>
  );
}
