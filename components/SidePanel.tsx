'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MemoExplorer } from './Memo';
import Agent from './Agent';
import AgentIcon from './AgentIcon';
import { Icon } from './ui';

const PK = 'm3x.panelPage', TK = 'm3x.tut.panel';
const PAGES: [string, string][] = [['sticky_note_2', 'メモ'], ['smart_toy', 'M3X Agent']];

/** Critically-under-damped spring (M3 Expressive "spatial" feel), driven by rAF. */
function useSpring(apply: (p: number) => void) {
  const st = useRef({ x: 0, v: 0, to: 0, raf: 0 });
  const stop = useCallback(() => { cancelAnimationFrame(st.current.raf); st.current.raf = 0; }, []);
  const set = useCallback((x: number) => { stop(); st.current.x = x; st.current.v = 0; apply(x); }, [apply, stop]);
  const go = useCallback((to: number, v0?: number) => {
    stop(); const s = st.current; s.to = to; if (v0 != null) s.v = v0;
    const k = 520, c = 2 * Math.sqrt(k) * 0.72; let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      s.v += (-k * (s.x - s.to) - c * s.v) * dt; s.x += s.v * dt; apply(s.x);
      if (Math.abs(s.x - s.to) < 0.0008 && Math.abs(s.v) < 0.01) { s.x = s.to; s.v = 0; apply(s.x); s.raf = 0; return; }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  }, [apply, stop]);
  return { st, go, set, stop };
}

const NO_DRAG = 'input,textarea,select,[contenteditable="true"],.ag-chips,.mx-srcs,.kp-tile img';

export default function SidePanel({ page: pageMode, agentOnly }: { page?: boolean; agentOnly?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [tut, setTut] = useState(-1);
  const apply = useCallback((p: number) => {
    if (track.current) track.current.style.transform = `translate3d(${-p * 100}%,0,0)`;
    wrap.current?.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
  }, []);
  const spring = useSpring(apply);
  const pageRef = useRef(0);
  const goTo = useCallback((i: number, v0?: number) => { pageRef.current = i; setPage(i); spring.go(i, v0); try { localStorage.setItem(PK, String(i)); } catch {} }, [spring]);

  useEffect(() => {
    if (agentOnly) return;
    const i = localStorage.getItem(PK) === '1' ? 1 : 0; pageRef.current = i; setPage(i); spring.set(i);
    if (!localStorage.getItem(TK)) setTut(0);
    const onAdd = () => goTo(1);
    window.addEventListener('m3x-open-agent', onAdd); return () => window.removeEventListener('m3x-open-agent', onAdd);
  }, [agentOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- pointer drag (touch / pen / mouse) ---- */
  const drag = useRef<{ id: number; x0: number; y0: number; p0: number; on: boolean; dead: boolean; samples: [number, number][] } | null>(null);
  const moved = useRef(false);
  const width = () => wrap.current?.querySelector('.sp-view')?.clientWidth || 360;
  const onDown = (e: React.PointerEvent) => {
    if (agentOnly || e.button !== 0 || (e.target as Element).closest(NO_DRAG)) return;
    if (e.pointerType === 'mouse' && (e.target as Element).closest('.ag-msg,.mx-editor')) return; // keep text selection
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: spring.st.current.x, on: false, dead: false, samples: [[e.clientX, e.timeStamp]] };
    moved.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.dead || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { d.dead = true; return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      d.on = true; moved.current = true; spring.stop(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      wrap.current?.classList.add('dragging');
    }
    let p = d.p0 - dx / width();
    if (p < 0) p = p * 0.3; else if (p > 1) p = 1 + (p - 1) * 0.3; // rubber band
    spring.st.current.x = p; apply(p);
    d.samples.push([e.clientX, e.timeStamp]); if (d.samples.length > 6) d.samples.shift();
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d || !d.on) return;
    wrap.current?.classList.remove('dragging');
    const [a, b] = [d.samples[0], d.samples[d.samples.length - 1]];
    const vx = b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0; // px/ms
    const pv = -(vx * 1000) / width(); // progress / s
    const proj = spring.st.current.x + pv * 0.18;
    const to = Math.max(0, Math.min(1, Math.round(proj)));
    spring.st.current.v = pv; goTo(to, pv);
    setTimeout(() => { moved.current = false; }, 0);
    void e;
  };

  /* ---- trackpad horizontal swipe (wheel deltaX) ---- */
  const wheel = useRef<{ t: number; dir: number; start: number }>({ t: 0, dir: 0, start: 0 });
  const onWheel = (e: React.WheelEvent) => {
    if (agentOnly || Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 1) return;
    if ((e.target as Element).closest('.ag-chips,.chips,.mx-srcs')) return;
    const w = wheel.current;
    if (!w.t) { spring.stop(); w.start = pageRef.current; }
    let p = spring.st.current.x + e.deltaX / width();
    p = Math.max(-0.15, Math.min(1.15, p));
    spring.st.current.x = p; apply(p); w.dir = Math.sign(e.deltaX);
    clearTimeout(w.t);
    w.t = window.setTimeout(() => {
      w.t = 0; const x = spring.st.current.x;
      const to = Math.abs(x - w.start) > 0.18 ? (w.dir > 0 ? 1 : 0) : w.start;
      goTo(Math.max(0, Math.min(1, to)));
    }, 110);
  };

  const finishTut = () => { setTut(-1); try { localStorage.setItem(TK, '1'); } catch {} };
  const TUT: [string, string, string, number][] = [
    ['swipe', 'メモ と M3X Agent', '上のタブ、または左右スワイプ（トラックパッド・ドラッグ）でページを切り替えられます。', 0],
    ['bookmarks', 'Keep に保存', 'タイムラインのポスト全体や、ポスト内の画像・動画・GIF を「Keep」へドラッグすると、あとで見返せます。', 0],
    ['smart_toy', 'M3X Agent', 'ポストを Agent にドロップするとコンテキストに（最大7件）。「Keep を整理して」「メモを作って」と頼めます。', 1],
    ['undo', 'いつでも元に戻せる', 'Agent の操作はステップごとに表示され、最後のまとめた操作は「元に戻す」で取り消せます。', 1],
  ];
  useEffect(() => { if (tut >= 0 && TUT[tut]) goTo(TUT[tut][3]); }, [tut]); // eslint-disable-line react-hooks/exhaustive-deps

  if (agentOnly) return <div className={'sp' + (pageMode ? ' page' : '')}><div className="sp-head solo"><span className="sp-title"><AgentIcon size={22} />M3X Agent</span></div><div className="sp-view"><Agent active /></div></div>;

  return (
    <div ref={wrap} className={'sp' + (pageMode ? ' page' : '')} style={{ ['--p' as any]: page }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
      onClickCapture={(e) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); } }}>
      <div className="sp-head">
        <div className="sp-seg" role="tablist" aria-label="パネル">
          <i className="sp-ind" aria-hidden />
          {PAGES.map(([ic, l], i) => (
            <button key={l} role="tab" aria-selected={page === i} className={page === i ? 'on' : ''} onClick={() => goTo(i)}>
              {l === 'M3X Agent' ? <AgentIcon size={18} /> : <Icon n={ic} s={18} fill={page === i} />}<span className="ell">{l}</span>
            </button>
          ))}
        </div>
        <button className="icon-btn sm" onClick={() => setTut(0)} aria-label="使い方" title="使い方"><Icon n="help" s={20} /></button>
      </div>
      <div className="sp-view">
        <div className="sp-track" ref={track}>
          <div className="sp-page" aria-hidden={page !== 0} inert={page !== 0 ? true : undefined}><MemoExplorer page={pageMode} /></div>
          <div className="sp-page" aria-hidden={page !== 1} inert={page !== 1 ? true : undefined}><Agent active={page === 1} /></div>
        </div>
      </div>
      {tut >= 0 && TUT[tut] && (
        <div className="tut" role="dialog" aria-label="使い方" onPointerDown={(e) => e.stopPropagation()}>
          <div className="tut-card" key={tut}>
            <span className="tut-ic">{TUT[tut][0] === 'smart_toy' ? <AgentIcon size={30} /> : <Icon n={TUT[tut][0]} s={28} fill />}</span>
            <b>{TUT[tut][1]}</b>
            <p>{TUT[tut][2]}</p>
            <div className="tut-foot">
              <span className="tut-dots">{TUT.map((_, i) => <i key={i} className={i === tut ? 'on' : ''} />)}</span>
              <span className="spacer" />
              <button className="btn text sm" onClick={finishTut}>スキップ</button>
              {tut < TUT.length - 1 ? <button className="btn filled sm" onClick={() => setTut(tut + 1)}>次へ</button>
                : <button className="btn filled sm" onClick={finishTut}>はじめる</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
