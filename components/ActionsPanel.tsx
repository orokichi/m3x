'use client';
import { useEffect, useRef, useState } from 'react';
import { useAxRun, stopAx, answerAx, answerConfirm, closeAx } from '@/lib/actions';
import AgentIcon from './AgentIcon';
import { Icon, Loader } from './ui';

/** Floating Agent Actions panel. Mounted once in Shell, so the run, its step
    log, questions and confirmations survive every route change. */
export default function ActionsPanel() {
  const r = useAxRun();
  const [txt, setTxt] = useState('');
  const [min, setMin] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [r.steps.length, r.status]);
  useEffect(() => { if (r.status === 'asking' || r.status === 'confirm') setMin(false); }, [r.status]);
  if (r.status === 'idle') return null;
  const busy = r.status === 'thinking' || r.status === 'acting' || r.status === 'confirm';
  const ended = r.status === 'done' || r.status === 'stopped' || r.status === 'error';
  const head = { thinking: '考え中…', acting: '操作中…', asking: '質問があります', confirm: '確認してください', done: '完了', stopped: '停止しました', error: 'エラー' }[r.status];
  return (
    <section className={'ax-panel' + (min ? ' min' : '')} aria-label="Agent Actions" aria-live="polite">
      <header className="ax-h">
        <span className="ax-orb">{busy ? <Loader s={22} /> : <AgentIcon size={20} />}</span>
        <div className="ax-ht"><b>Actions · {head}</b><span className="ell">{r.goal}</span></div>
        <button className="icon-btn sm" onClick={() => setMin(!min)} aria-label={min ? '開く' : '最小化'}><Icon n={min ? 'chevron_left' : 'remove'} s={18} /></button>
        {busy || r.status === 'asking'
          ? <button className="btn tonal sm ax-stop" onClick={stopAx}><Icon n="stop" s={18} fill />停止</button>
          : <button className="icon-btn sm" onClick={closeAx} aria-label="閉じる"><Icon n="close" s={18} /></button>}
      </header>
      {!min && <>
        <div className="ax-steps" ref={list}>
          {r.steps.map((s, i) => (
            <div key={s.id} className={'ax-step ' + s.state}>
              <span className="ax-si">{s.state === 'run' ? <Loader s={20} /> : s.state === 'ok' || s.state === 'done' ? <Icon n={s.icon === 'chat' ? 'chat' : 'check_circle'} s={18} fill /> : s.state === 'fail' ? <Icon n="remove_circle" s={18} /> : <Icon n="help" s={18} fill />}</span>
              <span className="ax-st"><span>{i + 1}. {s.text}</span>{s.thought && <small>{s.thought}</small>}</span>
            </div>
          ))}
          {r.status === 'thinking' && <div className="ax-step wait"><span className="ax-si"><Loader s={20} /></span><span className="ax-st">次の操作を考えています…</span></div>}
        </div>
        {r.status === 'confirm' && r.confirm && (
          <div className="ax-card warn">
            <div className="ax-ch"><Icon n="warning" s={18} />X に反映される操作です</div>
            <p>{r.confirm.label} を実行してよいですか？</p>
            <div className="ax-row"><span className="spacer" />
              <button className="btn text sm" onClick={() => answerConfirm(false)}>やめる</button>
              <button className="btn filled sm" onClick={() => answerConfirm(true)}>実行する</button>
            </div>
          </div>
        )}
        {r.status === 'asking' && r.question && (
          <div className="ax-card">
            <div className="ax-ch"><Icon n="help" s={18} />Agent からの質問</div>
            <p>{r.question.q}</p>
            {!!r.question.choices.length && <div className="ax-chips">{r.question.choices.map((c) => <button key={c} className="chip sl" onClick={() => answerAx(c)}>{c}</button>)}</div>}
            <form className="ax-in" onSubmit={(e) => { e.preventDefault(); if (txt.trim()) { answerAx(txt); setTxt(''); } }}>
              <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="自由に返信…" aria-label="返信" />
              <button className="icon-btn sm" type="submit" disabled={!txt.trim()} aria-label="送信"><Icon n="arrow_upward" s={18} /></button>
            </form>
          </div>
        )}
        {ended && r.message && <div className={'ax-msg' + (r.status === 'error' ? ' err' : '')}><Icon n={r.status === 'error' ? 'error' : r.status === 'stopped' ? 'stop' : 'task_alt'} s={18} /><span>{r.message}</span></div>}
      </>}
    </section>
  );
}
