'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { img } from '@/lib/api';
import { groq, parseJson, useGroq, type Msg } from '@/lib/ai';
import { memo, getMemo, useCtx, getCtx, addCtx, delCtx, clearCtx, snapshot, undo, clearUndo, KEEP, MAX_CTX, MAX_SRC, type Src, type Item } from '@/lib/memo';
import { AiText } from './AiText';
import AgentIcon from './AgentIcon';
import { Icon, Loader } from './ui';
import { useDrop } from './Memo';
import { buildAgentRequest, wantsKeep } from '@/lib/agentPrompt';
import { collectScreen, execAction, mouseOff, useAct, getAct, setAct, resetAct, type UiAction, type ActStep } from '@/lib/uiactions';

type StepState = 'wait' | 'run' | 'done' | 'skip';
interface Step { id: string; icon: string; run: string; done: string; state: StepState; thumbs?: string[]; exec: () => boolean | void }
interface Run { status: 'running' | 'done' | 'undone'; steps: Omit<Step, 'exec'>[]; summary?: string }
interface M { id: string; role: 'user' | 'assistant'; text?: string; run?: Run; pending?: boolean; err?: boolean; note?: boolean; ctxIds?: string[]; keepIds?: string[] }

const SYS = `あなたはXクライアント「EX」のアシスタント「Agent」。必ず次のJSONだけを返す:
{"reply":"日本語の短い返答(最大4行)","actions":[]}
基本はユーザーの質問に答えるだけで actions は必ず []。回答の根拠は今回渡された[コンテキスト]（と渡された場合の[Keep]）だけ。過去の会話に出てきた内容でも、今回のデータに無いものは使わない・言及しない。
Keepへの保存・移動・整理・フォルダ作成・ノート作成は、ユーザーの今回の依頼がそれを明示的に指示したときだけ actions に入れる。自分から提案して実行しない。
actions の要素:
{"type":"create_folder","name":"フォルダ名"}
{"type":"move","items":["K1","K2"],"folder":"フォルダ名"}  (Keepの保存アイテムを移動)
{"type":"create_note","folder":"フォルダ名","title":"短いタイトル","body":"本文(箇条書き可・最大300字)","sources":["C1","K2"]}
規則: 既存フォルダは同じ名前で再利用。ユーザーが整理・仕分けを指示した場合のみ、Keepのアイテムを内容ごとに2〜6個の短い日本語フォルダ名に分けてmove。ノート作成はポスト内容だけを根拠にし、sourcesに根拠IDを入れる。存在しないIDは使わない。根拠は[C1]のように示す。`;

const SYS_ACT = `あなたはXクライアント「EX」の画面操作エージェント。「EX Mouse」という仮想マウスで実際の画面を操作して、ユーザーの目的を達成する。必ず次のJSONだけを返す:
{"reply":"日本語の短い返答(最大3行)","steps":[],"done":false}
steps の要素:
{"type":"navigate","path":"/keep"}  (主要パス: /, /explore, /notifications, /super-search, /keep, /following, /lists, /settings, /search?q=キーワード)
{"type":"click","target":"要素ID"}  (下に渡される「操作可能要素」のIDだけを使う)
{"type":"scroll","dy":600}  (下方向が正)
{"type":"type","target":"search","text":"検索語","submit":true}
{"type":"dragToMemo","target":"post:ポストID"}  (ポストをドラッグして Keep に保存。ユーザーが保存を明示的に指示した場合のみ)
{"type":"askUser","question":"質問文","options":["選択肢1","選択肢2"]}  (判断に迷う・情報が足りないときだけ使う。これを返すときは他の steps を付けない)
{"type":"wait","ms":800}
規則: 目的が達成できたら done:true で steps は []。最大6ステップ。画面遷移(navigate)をしたら、その先の画面の要素はまだ分からないので steps はそこで止める。存在しないIDは絶対に作らない。目的の要素が見当たらなければ scroll で探すか askUser で聞く。`;

const QUICK: [string, string][] = [
  ['auto_awesome', 'Keep を整理して'],
  ['note_add', 'コンテキストのポストからノートを作って'],
  ['summarize', 'コンテキストのポストを要約して'],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cut = (s: string, n: number) => { const a = Array.from(s.replace(/https?:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim()); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
const uid = () => Math.random().toString(36).slice(2, 9);
const thumbOf = (i: Item) => (i.media ? (i.media.type === 'photo' ? i.media.url : i.media.thumb || i.media.url) : i.src.image || i.src.avatar || '');

export default function Agent({ active }: { active: boolean }) {
  const has = useGroq();
  const ctx = useCtx();
  const [msgs, setMsgs] = useState<M[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const d = useDrop((x) => addCtx(x.src));

  /* --- deleted-context isolation -------------------------------------------
     Past replies were generated FROM the context posts, so the plain chat
     history leaks deleted context data into later answers. When any context
     post is removed, cut the API history at that point: messages before the
     cut are displayed but never sent to the model again. */
  const msgsRef = useRef<M[]>([]);
  msgsRef.current = msgs;
  const [histFrom, setHistFrom] = useState(0);
  const prevCtxIds = useRef<string[] | null>(null);
  useEffect(() => {
    const ids = ctx.map((s) => s.id);
    const prev = prevCtxIds.current;
    prevCtxIds.current = ids;
    if (prev && prev.some((id) => !ids.includes(id))) {
      setHistFrom(msgsRef.current.length);
      setMsgs((ms) => [...ms, { id: uid(), role: 'assistant', note: true, text: 'コンテキストが削除されたため、それ以前の会話は今後の回答に使われません' }]);
    }
  }, [ctx]);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; } }, [q]);
  useEffect(() => { clearUndo(); }, []);

  const patch = (id: string, f: (m: M) => M) => setMsgs((ms) => ms.map((m) => (m.id === id ? f(m) : m)));
  const patchRun = (id: string, f: (r: Run) => Run) => patch(id, (m) => (m.run ? { ...m, run: f(m.run) } : m));

  /* ================= Actions mode (screen operation) =================
     When on (or while a question is pending), send() plans structured UI
     actions, the executor in lib/uiactions runs them with the EX Mouse,
     and the loop re-plans against the new screen until the AI reports
     done or asks the user a question.
     The run itself lives in the module-level store in lib/uiactions:
     on narrow screens this component is hosted by the /memo page, so a
     run that navigates away unmounts the Agent — the store (and the
     orphaned loop writing to it) survives, and a remounted Agent shows
     the same run and its pending question again. */
  const [actMode, setActMode] = useState(false);
  const act = useAct();
  const actBusy = act.status === 'running';
  const labelRef = useRef(new Map<string, string>());

  function validateActs(raw: any): UiAction[] {
    if (!Array.isArray(raw)) return [];
    const out: UiAction[] = [];
    for (const a of raw.slice(0, 6)) {
      if (!a || typeof a !== 'object') continue;
      const tgt = typeof a.target === 'string' ? a.target.slice(0, 90) : '';
      if (a.type === 'navigate' && typeof a.path === 'string' && a.path.startsWith('/') && a.path.length <= 140) out.push({ type: 'navigate', path: a.path });
      else if (a.type === 'click' && tgt) out.push({ type: 'click', target: tgt });
      else if (a.type === 'scroll') out.push({ type: 'scroll', dy: Math.max(-2400, Math.min(2400, Number(a.dy) || 600)) });
      else if (a.type === 'type' && tgt && typeof a.text === 'string' && a.text) out.push({ type: 'type', target: tgt, text: a.text.slice(0, 280), submit: !!a.submit });
      else if (a.type === 'dragToMemo' && tgt) out.push({ type: 'dragToMemo', target: tgt });
      else if (a.type === 'askUser' && typeof a.question === 'string' && a.question.trim()) out.push({ type: 'askUser', question: a.question.slice(0, 200), options: Array.isArray(a.options) ? a.options.filter((o: any) => typeof o === 'string').slice(0, 4).map((o: string) => o.slice(0, 60)) : [] });
      else if (a.type === 'wait') out.push({ type: 'wait', ms: Math.max(0, Math.min(3000, Number(a.ms) || 500)) });
    }
    return out;
  }

  const actLabel = (a: UiAction): { icon: string; label: string } => {
    const L = (id: string) => labelRef.current.get(id) || id;
    switch (a.type) {
      case 'navigate': return { icon: 'navigation', label: `「${a.path}」へ移動` };
      case 'click': return { icon: 'mouse', label: `「${L(a.target)}」をクリック` };
      case 'scroll': return { icon: 'swipe', label: a.dy >= 0 ? '下へスクロール' : '上へスクロール' };
      case 'type': return { icon: 'edit', label: `「${L(a.target)}」に「${cut(a.text, 24)}」と入力` };
      case 'dragToMemo': return { icon: 'sticky_note_2', label: `「${L(a.target)}」を Keep へドラッグ` };
      case 'askUser': return { icon: 'help', label: 'ユーザーに質問' };
      case 'wait': return { icon: 'hourglass_top', label: '少し待機' };
    }
  };

  async function sendAct(text: string) {
    const t = text.trim(); if (!t) return;
    if (getAct().status === 'running') return; /* a run is already going (maybe in an unmounted instance) */
    setQ(''); setBusy(true);
    const resuming = getAct().status === 'waiting' && !!getAct().goal;
    if (resuming) {
      setAct({ status: 'running', question: null, summary: '', log: [...getAct().log, `ユーザーの回答: ${t}`] });
    } else {
      resetAct();
      setAct({ status: 'running', goal: t, log: [], steps: [] });
    }
    setMsgs((ms) => [...ms, { id: uid(), role: 'user', text: t }]);
    const stepsUi: ActStep[] = [...getAct().steps];
    const syncSteps = () => setAct({ steps: [...stepsUi] });
    try {
      let rounds = 0; let finished = false;
      while (rounds++ < 5 && !finished) {
        const flow = getAct();
        const screen = collectScreen();
        labelRef.current = new Map(screen.els.map((e) => [e.id, e.label]));
        const prompt = `[現在の画面] パス: ${screen.path}\n[操作可能要素（ID : 内容）]\n${screen.els.map((e) => `${e.id} : ${e.label}`).join('\n') || 'なし'}\n[目的] ${flow.goal}\n[これまでの経過]\n${flow.log.join('\n') || 'なし'}`;
        const out = await groq([{ role: 'system', content: SYS_ACT }, { role: 'user', content: prompt }], { tier: 'large', json: true, max: 900, temperature: 0.2 });
        const j = parseJson<{ reply?: string; steps?: any[]; done?: boolean }>(out);
        if (!j) throw new Error('AIの応答を解釈できませんでした');
        if (rounds === 1) setAct({ reply: String(j.reply || '').slice(0, 400) });
        const keepOk = wantsKeep([flow.goal, ...flow.log.filter((l) => l.startsWith('ユーザーの回答:'))].join('\n'));
        const acts = validateActs(j.steps).filter((a) => a.type !== 'dragToMemo' || keepOk);
        let asked: Extract<UiAction, { type: 'askUser' }> | null = null;
        let executed = 0;
        for (const a of acts) {
          const meta = actLabel(a);
          const st: ActStep = { id: uid(), ...meta, state: 'wait' };
          stepsUi.push(st); syncSteps();
          if (a.type === 'askUser') { asked = a; st.state = 'done'; syncSteps(); setAct({ log: [...getAct().log, `質問: ${a.question}`] }); break; }
          st.state = 'run'; syncSteps();
          const r = await execAction(a);
          st.state = r === 'ok' ? 'done' : 'skip'; if (r === 'ok') executed++;
          syncSteps();
          setAct({ log: [...getAct().log, `実行: ${meta.label} → ${r === 'ok' ? '成功' : 'スキップ（対象が見つからず）'}`] });
        }
        if (asked) {
          setAct({ status: 'waiting', question: { q: asked.question, options: asked.options || [] } });
          return; /* wait for the user's answer; the store keeps the flow alive */
        }
        if (j.done || !acts.length) { setAct({ status: 'done', summary: stepsUi.length ? '完了しました' : '' }); finished = true; }
        else if (!executed) { setAct({ status: 'done', summary: '対象の要素が見つからず、実行できませんでした' }); finished = true; }
        /* otherwise loop: re-plan against the new screen */
      }
      if (!finished) setAct({ status: 'done', summary: 'ステップ数の上限に達したため終了しました' });
    } catch (e: any) {
      setAct({ status: 'error', error: e.message || 'エラーが発生しました' });
    } finally { setBusy(false); mouseOff(); }
  }

  async function send(text: string) {
    if (actMode || getAct().status === 'waiting') return sendAct(text);
    const t = text.trim(); if (!t || busy || actBusy) return;
    setQ(''); setBusy(true);
    const uidU = uid(), aid = uid();
    const keep = getMemo().folders.find((f) => f.id === KEEP)?.items || [];
    /* Read the context store fresh at send time (never a render snapshot),
       so a deletion that just happened is always honoured. History turns
       built from a removed context post / Keep item are never resent. */
    const ctxNow = getCtx();
    const req = buildAgentRequest({ sys: SYS, msgs: msgsRef.current, ctx: ctxNow, keep, folders: getMemo().folders, text: t, from: histFrom });
    setMsgs((ms) => [...ms, { id: uidU, role: 'user', text: t, ctxIds: req.ctxIds, keepIds: req.keepIds }, { id: aid, role: 'assistant', pending: true, ctxIds: req.ctxIds, keepIds: req.keepIds }]);
    try {
      const out = await groq(req.messages as Msg[], { tier: 'small', json: true, max: 650, temperature: 0.2 });
      const j = parseJson<{ reply?: string; actions?: any[] }>(out);
      const reply = String(j?.reply || (j ? '' : out) || '').trim();
      /* Keep actions only on an explicit save/organize instruction in THIS message. */
      const actions = req.keepOn && Array.isArray(j?.actions) ? j!.actions.slice(0, 14) : [];
      const steps = plan(actions, req.keepSent as Item[], ctxNow);
      patch(aid, (m) => ({ ...m, pending: false, text: reply || (steps.length ? '実行します。' : '特に実行することはありませんでした。'), run: steps.length ? { status: 'running', steps: steps.map(({ exec, ...s }) => s) } : undefined }));
      if (steps.length) await execute(aid, steps);
    } catch (e: any) {
      patch(aid, (m) => ({ ...m, pending: false, err: true, text: e.message || 'エラーが発生しました' }));
    } finally { setBusy(false); }
  }

  /** Turn the model's action plan into concrete, validated steps. */
  function plan(actions: any[], keep: Item[], ctxNow: Src[]): Step[] {
    const steps: Step[] = [];
    const names = new Map(getMemo().folders.map((f) => [f.name.toLowerCase(), f.id]));
    const pending = new Set<string>();
    const fid = (name: string) => names.get(name.toLowerCase());
    const ensure = (raw: any) => {
      const name = String(raw || '').trim().slice(0, 40);
      if (!name || name.toLowerCase() === 'keep') return name.toLowerCase() === 'keep' ? 'Keep' : '';
      if (!fid(name) && !pending.has(name.toLowerCase())) {
        pending.add(name.toLowerCase());
        steps.push({ id: uid(), icon: 'create_new_folder', run: `フォルダ「${name}」を作成中…`, done: `フォルダ「${name}」を作成`, state: 'wait', exec: () => { if (!fid(name)) names.set(name.toLowerCase(), memo.addFolder(name)); } });
      }
      return name;
    };
    const used = new Set<string>();
    const kItem = (id: any) => { const m = String(id).match(/^K(\d+)$/i); return m ? keep[+m[1] - 1] : undefined; };
    const src = (id: any): Src | undefined => { const s = String(id); const m = s.match(/^C(\d+)$/i); return m ? ctxNow[+m[1] - 1] : kItem(s)?.src; };
    for (const a of actions) {
      if (!a || typeof a !== 'object') continue;
      if (a.type === 'create_folder') ensure(a.name);
      else if (a.type === 'move') {
        const name = ensure(a.folder); if (!name) continue;
        const its = (Array.isArray(a.items) ? a.items : []).map(kItem).filter((i: Item | undefined): i is Item => !!i && !used.has(i.id));
        if (!its.length) continue;
        its.forEach((i: Item) => used.add(i.id));
        steps.push({ id: uid(), icon: 'drive_file_move', run: `${its.length}件を「${name}」へ移動中…`, done: `${its.length}件を「${name}」へ移動`, state: 'wait', thumbs: its.slice(0, 6).map(thumbOf),
          exec: () => { const to = name === 'Keep' ? KEEP : fid(name); return !!to && memo.moveItems(its.map((i: Item) => i.id), to) > 0; } });
      } else if (a.type === 'create_note') {
        const name = ensure(a.folder || 'Keep');
        const title = String(a.title || '').trim().slice(0, 120) || '無題のノート';
        const body = String(a.body || '').trim().slice(0, 2000);
        const seen = new Set<string>();
        const sources = (Array.isArray(a.sources) ? a.sources : []).map(src).filter((s: Src | undefined): s is Src => !!s && !seen.has(s.id) && !!seen.add(s.id)).slice(0, MAX_SRC);
        steps.push({ id: uid(), icon: 'note_add', run: `ノート「${cut(title, 18)}」を作成中…`, done: `ノート「${cut(title, 18)}」を作成${sources.length ? `（参照${sources.length}件）` : ''}`, state: 'wait',
          exec: () => { const to = name === 'Keep' ? KEEP : fid(name); if (!to) return false; memo.addNote(to, { title, body, sources }); } });
      }
    }
    return steps;
  }

  async function execute(aid: string, steps: Step[]) {
    snapshot(); setLastRun(aid);
    let ok = 0;
    for (const s of steps) {
      patchRun(aid, (r) => ({ ...r, steps: r.steps.map((x) => (x.id === s.id ? { ...x, state: 'run' } : x)) }));
      await sleep(s.thumbs ? 900 : 650);
      const res = s.exec();
      const st: StepState = res === false ? 'skip' : 'done'; if (st === 'done') ok++;
      patchRun(aid, (r) => ({ ...r, steps: r.steps.map((x) => (x.id === s.id ? { ...x, state: st } : x)) }));
      await sleep(120);
    }
    patchRun(aid, (r) => ({ ...r, status: 'done', summary: `${ok}件の操作を完了しました` }));
  }

  const doUndo = (aid: string) => { if (undo()) { patchRun(aid, (r) => ({ ...r, status: 'undone', summary: '元に戻しました' })); setLastRun(null); } };

  if (!has) return (
    <div className="ag-wrap">
      <div className="ag-nokey">
        <span className="ag-orb"><AgentIcon size={36} /></span>
        <h3>Agent</h3>
        <p className="muted small">Groq の API キーを設定すると、ポストについて質問したり、頼んだときに Keep の整理やノート作成ができます。</p>
        <Link className="btn filled" href="/settings#ai"><Icon n="key" />設定で API キーを登録</Link>
      </div>
    </div>
  );

  return (
    <div className={'ag-wrap' + (d.over ? ' over' : '')} {...d.props}>
      <div className="ag-list" ref={list}>
        {!msgs.length && (
          <div className="ag-hello">
            <span className="ag-orb"><AgentIcon size={34} /></span>
            <b>Agent</b>
            <p className="muted small">ポストをここへドラッグしてコンテキストに追加（最大{MAX_CTX}件）。Keep への保存・整理は頼んだときだけ行います。</p>
            <div className="ag-quick">{QUICK.map(([ic, t]) => <button key={t} className="chip sl" onClick={() => send(t)} disabled={busy}><Icon n={ic} s={18} />{t}</button>)}</div>
          </div>
        )}
        {msgs.map((m) => m.note ? (
          <div key={m.id} className="ag-note"><span>{m.text}</span></div>
        ) : (
          <div key={m.id} className={'ag-msg ' + m.role + (m.err ? ' err' : '')}>
            {m.pending ? <span className="ag-think"><Loader s={26} />考え中…</span>
              : m.role === 'assistant' ? <AiText text={m.text || ''} /> : m.text}
            {m.run && <RunCard run={m.run} canUndo={lastRun === m.id && m.run.status === 'done'} onUndo={() => doUndo(m.id)} />}
          </div>
        ))}
      </div>
      {act.status !== 'idle' && (
        <div className="ag-live">
          {act.reply && <p className="ag-live-reply">{act.reply}</p>}
          {!!act.steps.length && <ActCard run={{ status: act.status === 'done' ? 'done' : 'running', steps: act.steps, summary: act.status === 'done' ? act.summary : undefined }} />}
          {act.status === 'error' && <div className="ag-live-err"><Icon n="error" s={18} /><span>{act.error}</span></div>}
          {act.status === 'waiting' && act.question && (
            <div className="ag-q">
              <div className="ag-q-h"><Icon n="help" s={18} />Agent からの質問です</div>
              <p style={{ margin: 0 }}>{act.question.q}</p>
              {!!act.question.options.length && <div className="ag-q-opts">{act.question.options.map((o) => (
                <button key={o} className="chip sl" onClick={() => sendAct(o)}>{o}</button>
              ))}</div>}
              <p className="muted small" style={{ margin: 0 }}>選択肢をタップするか、下の入力欄から自由に返信してください</p>
            </div>
          )}
          {act.status !== 'running' && <button className="icon-btn sm ag-live-x" onClick={() => resetAct()} aria-label="閉じる"><Icon n="close" s={18} /></button>}
        </div>
      )}
      <div className="ag-dock">
        <div className={'ag-ctx' + (d.over ? ' over' : '')}>
          <span className={'mx-count' + (ctx.length >= MAX_CTX ? ' full' : '')} title="コンテキストのポスト">{ctx.length}/{MAX_CTX}</span>
          {ctx.length ? <>
            <div className="ag-chips">{ctx.map((s, i) => (
              <span key={s.id} className="ag-chip" title={`@${s.handle}: ${s.text}`}>
                {s.image ? <img src={img(s.image, 'thumb')} alt="" referrerPolicy="no-referrer" draggable={false} /> : s.avatar ? <img className="r" src={img(s.avatar)} alt="" referrerPolicy="no-referrer" draggable={false} /> : <Icon n="article" s={16} />}
                <span className="ell">C{i + 1} @{s.handle}</span>
                <button onClick={() => delCtx(s.id)} aria-label="外す"><Icon n="close" s={14} /></button>
              </span>
            ))}</div>
            <button className="icon-btn sm" onClick={clearCtx} aria-label="すべて外す" title="すべて外す"><Icon n="clear_all" s={18} /></button>
          </> : <span className="muted small ell">{d.over ? 'ドロップして追加' : 'ポストをドラッグしてコンテキストに追加'}</span>}
        </div>
        <form className="ag-in" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <button type="button" className={'ag-mode' + (actMode ? ' on' : '')} onClick={() => setActMode((v) => !v)} aria-pressed={actMode} title="Actions モード：EX Mouse が画面を操作します">
            <Icon n="mouse" s={19} /><span>Actions</span>
          </button>
          <textarea ref={ta} rows={1} value={q} onChange={(e) => setQ(e.target.value)} placeholder={actMode ? 'Actions：やりたいことを入力（例：最新のポストを Keep に入れて）' : 'Agent に頼む…（例: Keep を整理して）'} aria-label="メッセージ"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(q); } }} tabIndex={active ? 0 : -1} />
          <button className={'ag-send' + (busy || actBusy ? ' busy' : '')} type="submit" disabled={busy || actBusy || !q.trim()} aria-label="送信">{busy || actBusy ? <Loader s={22} /> : <Icon n="arrow_upward" />}</button>
        </form>
      </div>
      {d.over && <div className="ag-drop"><Icon n="add_link" s={28} />コンテキストに追加</div>}
    </div>
  );
}

function RunCard({ run, canUndo, onUndo }: { run: Run; canUndo: boolean; onUndo: () => void }) {
  return (
    <div className={'ag-run ' + run.status}>
      {run.steps.map((s) => (
        <div key={s.id} className={'ag-step ' + s.state}>
          <span className="ag-si">{s.state === 'run' ? <Loader s={22} /> : s.state === 'done' ? <Icon n="check_circle" s={20} fill /> : s.state === 'skip' ? <Icon n="remove_circle" s={20} /> : <Icon n={s.icon} s={20} />}</span>
          <span className="ag-sl">{s.state === 'run' ? s.run : s.done}</span>
          {s.thumbs && s.state === 'run' && (
            <span className="ag-fly" aria-hidden>
              {s.thumbs.map((t, i) => <i key={i} style={{ ['--i' as any]: i }}>{t ? <img src={img(t, 'thumb')} alt="" referrerPolicy="no-referrer" /> : null}</i>)}
              <b><Icon n="folder" fill s={22} /></b>
            </span>
          )}
        </div>
      ))}
      {run.status !== 'running' && (
        <div className="ag-sum">
          <Icon n={run.status === 'undone' ? 'undo' : 'task_alt'} s={18} /><span className="ell">{run.summary}</span><span className="spacer" />
          {canUndo && <button className="btn tonal sm" onClick={onUndo}><Icon n="undo" />元に戻す</button>}
        </div>
      )}
    </div>
  );
}

/** Live step list for an Actions (screen operation) run. Rendered from the
    module-level act store, so it survives the Agent being unmounted by
    navigation and reappears when the user comes back. */
function ActCard({ run }: { run: { status: 'running' | 'done'; steps: ActStep[]; summary?: string } }) {
  return (
    <div className={'ag-run ' + run.status}>
      {run.steps.map((s) => (
        <div key={s.id} className={'ag-step ' + s.state}>
          <span className="ag-si">{s.state === 'run' ? <Loader s={22} /> : s.state === 'done' ? <Icon n="check_circle" s={20} fill /> : s.state === 'skip' ? <Icon n="remove_circle" s={20} /> : <Icon n={s.icon} s={20} />}</span>
          <span className="ag-sl">{s.label}</span>
        </div>
      ))}
      {run.status !== 'running' && run.summary && (
        <div className="ag-sum"><Icon n="task_alt" s={18} /><span className="ell">{run.summary}</span></div>
      )}
    </div>
  );
}
