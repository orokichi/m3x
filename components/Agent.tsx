'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { img } from '@/lib/api';
import { groq, parseJson, useGroq, type Msg } from '@/lib/ai';
import { memo, getMemo, useCtx, addCtx, delCtx, clearCtx, snapshot, undo, clearUndo, KEEP, MAX_CTX, MAX_SRC, type Src, type Item } from '@/lib/memo';
import { AiText } from './AiText';
import { Icon, Loader } from './ui';
import { useDrop } from './Memo';

type StepState = 'wait' | 'run' | 'done' | 'skip';
interface Step { id: string; icon: string; run: string; done: string; state: StepState; thumbs?: string[]; exec: () => boolean | void }
interface Run { status: 'running' | 'done' | 'undone'; steps: Omit<Step, 'exec'>[]; summary?: string }
interface M { id: string; role: 'user' | 'assistant'; text?: string; run?: Run; pending?: boolean; err?: boolean }

const SYS = `あなたはXクライアント「M3X」のメモ整理エージェント。必ず次のJSONだけを返す:
{"reply":"日本語の短い返答(最大4行)","actions":[]}
actions の要素:
{"type":"create_folder","name":"フォルダ名"}
{"type":"move","items":["K1","K2"],"folder":"フォルダ名"}  (Keepの保存アイテムを移動)
{"type":"create_note","folder":"フォルダ名","title":"短いタイトル","body":"本文(箇条書き可・最大300字)","sources":["C1","K2"]}
規則: 既存フォルダは同じ名前で再利用。「整理」「仕分け」ならKeepの全アイテムを内容ごとに2〜6個の短い日本語フォルダ名に分けてmove。メモ作成はポスト内容だけを根拠にし、sourcesに根拠IDを入れる。存在しないIDは使わない。質問だけならactionsは[]でreplyに答える(根拠は[C1]のように示す)。`;

const QUICK: [string, string][] = [
  ['auto_awesome', 'Keep を自動整理して'],
  ['note_add', 'コンテキストのポストからメモを作って'],
  ['summarize', 'コンテキストのポストを要約して'],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cut = (s: string, n: number) => { const a = Array.from(s.replace(/https?:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim()); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
const uid = () => Math.random().toString(36).slice(2, 9);
const thumbOf = (i: Item) => (i.media ? (i.media.type === 'photo' ? i.media.url : i.media.thumb || i.media.url) : i.src.image || i.src.avatar || '');

/** Compact prompt context (keeps Groq tokens low). */
function buildContext(keep: Item[], ctx: Src[]) {
  const fs = getMemo().folders;
  const f = fs.slice(0, 30).map((x) => `${x.name}(保存${x.items?.length || 0}/メモ${x.notes.length})`).join(', ');
  const k = keep.slice(0, 40).map((i, n) => `K${n + 1} ${i.media ? (i.media.type === 'photo' ? '画像' : i.media.type === 'gif' ? 'GIF' : '動画') : 'ポスト'} @${i.src.handle}: ${cut(i.src.text, 70)}`).join('\n');
  const c = ctx.map((s, n) => `C${n + 1} @${s.handle}: ${cut(s.text, 240)}`).join('\n');
  return `[フォルダ] ${f || 'なし'}\n[Keep]\n${k || 'なし'}\n[コンテキスト]\n${c || 'なし'}`;
}

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

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; } }, [q]);
  useEffect(() => { clearUndo(); }, []);

  const patch = (id: string, f: (m: M) => M) => setMsgs((ms) => ms.map((m) => (m.id === id ? f(m) : m)));
  const patchRun = (id: string, f: (r: Run) => Run) => patch(id, (m) => (m.run ? { ...m, run: f(m.run) } : m));

  async function send(text: string) {
    const t = text.trim(); if (!t || busy) return;
    setQ(''); setBusy(true);
    const uidU = uid(), aid = uid();
    const hist: Msg[] = msgs.filter((m) => m.text && !m.err).slice(-4).map((m) => ({ role: m.role, content: cut(m.text!, 300) }));
    setMsgs((ms) => [...ms, { id: uidU, role: 'user', text: t }, { id: aid, role: 'assistant', pending: true }]);
    const keep = getMemo().folders.find((f) => f.id === KEEP)?.items || [];
    const ctxNow = ctx.slice();
    try {
      const out = await groq([{ role: 'system', content: SYS }, ...hist, { role: 'user', content: `${buildContext(keep, ctxNow)}\n[依頼] ${t}` }], { tier: 'small', json: true, max: 650, temperature: 0.2 });
      const j = parseJson<{ reply?: string; actions?: any[] }>(out);
      const reply = String(j?.reply || (j ? '' : out) || '').trim();
      const actions = Array.isArray(j?.actions) ? j!.actions.slice(0, 14) : [];
      const steps = plan(actions, keep, ctxNow);
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
        const title = String(a.title || '').trim().slice(0, 120) || '無題のメモ';
        const body = String(a.body || '').trim().slice(0, 2000);
        const seen = new Set<string>();
        const sources = (Array.isArray(a.sources) ? a.sources : []).map(src).filter((s: Src | undefined): s is Src => !!s && !seen.has(s.id) && !!seen.add(s.id)).slice(0, MAX_SRC);
        steps.push({ id: uid(), icon: 'note_add', run: `メモ「${cut(title, 18)}」を作成中…`, done: `メモ「${cut(title, 18)}」を作成${sources.length ? `（参照${sources.length}件）` : ''}`, state: 'wait',
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
        <span className="ag-orb"><Icon n="smart_toy" s={32} fill /></span>
        <h3>M3X Agent</h3>
        <p className="muted small">Groq の API キーを設定すると、ポストをもとにメモを作ったり、Keep を自動で整理したりできます。</p>
        <Link className="btn filled" href="/settings#ai"><Icon n="key" />設定で API キーを登録</Link>
      </div>
    </div>
  );

  return (
    <div className={'ag-wrap' + (d.over ? ' over' : '')} {...d.props}>
      <div className="ag-list" ref={list}>
        {!msgs.length && (
          <div className="ag-hello">
            <span className="ag-orb"><Icon n="smart_toy" s={30} fill /></span>
            <b>M3X Agent</b>
            <p className="muted small">ポストをここへドラッグしてコンテキストに追加（最大{MAX_CTX}件）。Keep の整理やメモ作成を頼めます。</p>
            <div className="ag-quick">{QUICK.map(([ic, t]) => <button key={t} className="chip sl" onClick={() => send(t)} disabled={busy}><Icon n={ic} s={18} />{t}</button>)}</div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={'ag-msg ' + m.role + (m.err ? ' err' : '')}>
            {m.pending ? <span className="ag-think"><Loader s={26} />考え中…</span>
              : m.role === 'assistant' ? <AiText text={m.text || ''} /> : m.text}
            {m.run && <RunCard run={m.run} canUndo={lastRun === m.id && m.run.status === 'done'} onUndo={() => doUndo(m.id)} />}
          </div>
        ))}
      </div>
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
          <textarea ref={ta} rows={1} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Agent に頼む…（例: Keep を整理して）" aria-label="メッセージ"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(q); } }} tabIndex={active ? 0 : -1} />
          <button className={'ag-send' + (busy ? ' busy' : '')} type="submit" disabled={busy || !q.trim()} aria-label="送信">{busy ? <Loader s={22} /> : <Icon n="arrow_upward" />}</button>
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
