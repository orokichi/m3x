'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { x, toast, getCreds, getFollows } from '@/lib/api';
import { useGroq } from '@/lib/ai';
import { useAi, lite } from '@/lib/aiTasks';
import { POST_KINDS, COMPOSE, postJob, parseDrafts, digestJob, threadJob, trendJob, profileJob, composeJob, parseTags, cleanRewrite, type PostKind, type ComposeKind, type LitePost } from '@/lib/aiPrompts';
import { getSoFar } from '@/lib/visible';
import type { XTweet, XUser, Page } from '@/lib/types';
import { AiText } from './AiText';
import GroqMark from './GroqMark';

/* Groq features shown around posts, feeds, trends, profiles and the composer.
   All results are text / drafts / suggestions: nothing here posts, likes or follows.
   Everything renders nothing without a Groq key (useGroq() === false). */

const I = ({ n, s, fill }: { n: string; s?: number; fill?: boolean }) => <span className={'ms' + (fill ? ' fill' : '')} style={s ? { fontSize: s } : undefined}>{n}</span>;
const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('コピーしました'), () => toast('コピーできませんでした'));
const Skel = ({ n = 3 }: { n?: number }) => <div className="ai-skel">{Array.from({ length: n }, (_, i) => <i key={i} />)}</div>;
export const compose = (detail: { replyTo?: XTweet; quote?: XTweet; text?: string }) => window.dispatchEvent(new CustomEvent('m3x-compose', { detail }));

/** Menu items for the per-post AI button (rendered inside Actions' menu). */
export function PostAiMenu({ onPick, onCtx }: { onPick: (k: PostKind) => void; onCtx: () => void }) {
  return <>
    <div className="menu-h"><GroqMark size={14} title="Groq" /></div>
    {POST_KINDS.map(([k, l, ic]) => <button key={k} role="menuitem" onClick={() => onPick(k)}><I n={ic} />{l}</button>)}
    <button role="menuitem" onClick={onCtx}><I n="add_link" />Groq のコンテキストに追加</button>
  </>;
}

/** Inline result card under a post. */
export function PostAiBox({ t, kind, onClose }: { t: XTweet; kind: PostKind; onClose: () => void }) {
  const ai = useAi();
  useEffect(() => { ai.run(postJob(kind, lite(t))); }, [kind, t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = POST_KINDS.find(([k]) => k === kind)?.[1] || 'AI';
  const drafts = kind === 'reply' && ai.out ? parseDrafts(ai.out) : [];
  const authed = !!getCreds();
  return (
    <div className="pai" onClick={stop} role="region" aria-label={`AI: ${label}`}>
      <div className="pai-h">
        <span className="pai-badge"><GroqMark compact size={14} /></span><b className="ell">{label}</b><span className="spacer" />
        {ai.out && <button className="icon-btn xs" onClick={() => ai.run(postJob(kind, lite(t)), true)} title="再生成" aria-label="再生成"><I n="refresh" s={18} /></button>}
        {ai.out && kind !== 'reply' && <button className="icon-btn xs" onClick={() => copy(ai.out!)} title="コピー" aria-label="コピー"><I n="content_copy" s={18} /></button>}
        <button className="icon-btn xs" onClick={onClose} title="閉じる" aria-label="閉じる"><I n="close" s={18} /></button>
      </div>
      {ai.busy && <Skel n={kind === 'summary' ? 2 : 3} />}
      {ai.err && <p className="c-err small">{ai.err}</p>}
      {ai.out && kind !== 'reply' && <AiText text={ai.out} />}
      {kind === 'reply' && ai.out && <div className="pai-drafts">
        {drafts.length ? drafts.map((d, i) => (
          <div key={i} className="pai-draft"><span>{d}</span>
            <div className="row-flex">
              <span className="muted small">{Array.from(d).length}字</span><span className="spacer" />
              <button className="btn text sm" onClick={() => copy(d)}><I n="content_copy" s={16} />コピー</button>
              {authed && <button className="btn tonal sm" onClick={() => compose({ replyTo: t, text: d })}><I n="edit" s={16} />返信欄に入れる</button>}
            </div>
          </div>)) : <p className="muted small">返信案を作れませんでした。</p>}
        <p className="muted small" style={{ margin: 0 }}>下書きのみです。送信は返信画面であなたが行います。</p>
      </div>}
    </div>
  );
}

/** Modal sheet that shows a Groq result with [n] citations linking to posts. */
function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(
    <div className="dialog-scrim" onClick={onClose}>
      <div className="dialog ai-sheet" onClick={stop} role="dialog" aria-label={title}>
        <div className="ai-sheet-h"><span className="as-badge"><I n="auto_awesome" s={20} fill /></span><div className="as-ttl"><span className="as-kick">GROQ</span><h2>{title}</h2>{sub && <span className="muted small">{sub}</span>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる"><I n="close" /></button></div>
        <div className="ai-sheet-b">{children}</div>
      </div>
    </div>, document.body);
}

/** "ここまでの要約": posts loaded above the bottom of the screen (or of one deck column). */
export function DigestButton({ scope, label = 'ここまでの要約', compact }: { scope?: () => Element | null; label?: string; compact?: boolean }) {
  const has = useGroq();
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<XTweet[]>([]);
  const ai = useAi();
  if (!has) return null;
  const go = () => {
    const ps = getSoFar(scope?.() || null, 30);
    setPosts(ps); setOpen(true);
    if (ps.length) ai.run(digestJob(location.pathname, ps.map(lite)));
  };
  return <>
    <button className={compact ? 'icon-btn sm' : 'btn tonal sm ai-pill'} onClick={go} title={label} aria-label={label}><I n="summarize" s={18} />{!compact && label}</button>
    {open && <Sheet title={label} sub={posts.length ? `${posts.length}件のポストから` : undefined} onClose={() => { setOpen(false); ai.reset(); }}>
      {!posts.length ? <p className="muted">要約できるポストがまだありません。</p> : <>
        {ai.busy && <Skel n={4} />}{ai.err && <p className="c-err small">{ai.err}</p>}
        {ai.out && <AiText text={ai.out} hrefOf={(n) => (posts[n - 1] ? `/status/${posts[n - 1].id}` : undefined)} />}
      </>}
    </Sheet>}
  </>;
}

/** Post detail: thread / replies summary. */
export function ThreadSummary({ t, parents }: { t: XTweet; parents: XTweet[] }) {
  const has = useGroq();
  const ai = useAi();
  const [reps, setReps] = useState<XTweet[]>([]);
  const authed = !!getCreds();
  if (!has || (!authed && !parents.length)) return null;
  const go = async () => {
    let rs: XTweet[] = [];
    if (authed) rs = await x<Page<XTweet>>('replies', { id: t.id }).then((p) => p.list.slice(0, 25)).catch(() => []);
    setReps(rs);
    ai.run(threadJob(lite(t), parents.map(lite), rs.map(lite)));
  };
  return (
    <section className="ai-card thin">
      <div className="ai-h"><I n="forum" fill /><b>{authed ? 'スレッド・返信の要約' : 'スレッドの要約'}</b><span className="spacer" />
        <button className="btn filled sm" onClick={go} disabled={ai.busy}><I n={ai.out ? 'refresh' : 'summarize'} />{ai.out ? '再要約' : '要約する'}</button></div>
      {!ai.out && !ai.busy && !ai.err && <p className="muted small" style={{ margin: 0 }}>{authed ? '本文と返信（最大25件）の論点・反応の傾向をまとめます。' : '返信の取得にはログインが必要です。スレッドの流れだけをまとめます。'}</p>}
      {ai.busy && <Skel />}{ai.err && <p className="c-err small">{ai.err}</p>}
      {ai.out && <AiText text={ai.out} hrefOf={(n) => (reps[n - 1] ? `/status/${reps[n - 1].id}` : undefined)} />}
    </section>
  );
}

/** Trend row add-on: "なぜ話題?" */
export function TrendWhy({ name, query }: { name: string; query: string }) {
  const has = useGroq();
  const ai = useAi();
  const [open, setOpen] = useState(false);
  const [ps, setPs] = useState<XTweet[]>([]);
  if (!has) return null;
  const go = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (open) { setOpen(false); return; }
    setOpen(true); if (ai.out || ai.busy) return;
    const args = getCreds() ? { q: query, tab: 'top' } : { q: query, tab: 'top', ids: getFollows().map((u) => u.id) };
    const list = await x<Page<XTweet>>('search', args).then((p) => p.list.slice(0, 15)).catch(() => []);
    setPs(list); ai.run(trendJob(name, list.map(lite)));
  };
  return <>
    <button className={'why-btn' + (open ? ' on' : '')} onClick={go} aria-expanded={open} title="なぜ話題？"><I n="auto_awesome" s={16} fill={open} />なぜ話題?</button>
    {open && <div className="why-box" onClick={(e) => { e.stopPropagation(); }}>
      {(ai.busy || (!ai.out && !ai.err)) && <Skel n={2} />}{ai.err && <p className="c-err small">{ai.err}</p>}
      {ai.out && <AiText text={ai.out} hrefOf={(n) => (ps[n - 1] ? `/status/${ps[n - 1].id}` : undefined)} />}
    </div>}
  </>;
}

/** Profile: AI insight of the user's recent posts. */
export function ProfileInsight({ u }: { u: XUser }) {
  const has = useGroq();
  const ai = useAi();
  const [ps, setPs] = useState<XTweet[]>([]);
  if (!has) return null;
  const go = async () => {
    const list = await x<Page<XTweet>>('utweets', { id: u.id, tab: 'posts' }).then((p) => p.list.filter((t) => !t.rtBy).slice(0, 25)).catch(() => []);
    setPs(list); ai.run(profileJob(u, list.map(lite)));
  };
  return (
    <section className="ai-card thin">
      <div className="ai-h"><I n="person_search" fill /><b>AI プロフィール分析</b><span className="spacer" />
        <button className="btn filled sm" onClick={go} disabled={ai.busy}><I n={ai.out ? 'refresh' : 'auto_awesome'} />{ai.out ? '更新' : '最近のポストを分析'}</button></div>
      {!ai.out && !ai.busy && !ai.err && <p className="muted small" style={{ margin: 0 }}>最近のポスト（最大25件）から、よく話す話題や最近のトピックをまとめます。</p>}
      {ai.busy && <Skel />}{ai.err && <p className="c-err small">{ai.err}</p>}
      {ai.out && <AiText text={ai.out} hrefOf={(n) => (ps[n - 1] ? `/status/${ps[n - 1].id}` : undefined)} />}
    </section>
  );
}

/** Composer: proofread / tone / length / hashtags. Suggestions only; the user applies them. */
export function ComposeAssist({ text, setText, replyTo }: { text: string; setText: (s: string) => void; replyTo?: XTweet }) {
  const has = useGroq();
  const ai = useAi();
  const [kind, setKind] = useState<ComposeKind | null>(null);
  if (!has) return null;
  const go = (k: ComposeKind) => { if (!text.trim()) { toast('先に本文を入力してください'); return; } setKind(k); ai.run(composeJob(k, text, replyTo ? (lite(replyTo) as LitePost) : undefined)); };
  const tags = kind === 'tags' && ai.out ? parseTags(ai.out) : [];
  const rew = kind && kind !== 'tags' && ai.out ? cleanRewrite(ai.out) : '';
  return (
    <div className="cassist">
      <div className="chips" role="toolbar" aria-label="AI 作成アシスト">
        <span className="ca-l"><GroqMark compact size={16} /></span>
        {COMPOSE.map(([k, l]) => <button key={k} className={'chip sm' + (kind === k ? ' on' : '')} onClick={() => go(k)} disabled={ai.busy}>{l}</button>)}
      </div>
      {kind && <div className="ca-box">
        {ai.busy && <Skel n={2} />}{ai.err && <p className="c-err small">{ai.err}</p>}
        {rew && <><div className="ca-prev">{rew}</div>
          <div className="row-flex"><span className={'small ' + (Array.from(rew).length > 280 ? 'c-err' : 'muted')}>{Array.from(rew).length}字</span><span className="spacer" />
            <button className="btn text sm" onClick={() => { setKind(null); ai.reset(); }}>閉じる</button>
            <button className="btn tonal sm" onClick={() => { setText(rew); setKind(null); ai.reset(); }}><I n="check" s={16} />置き換える</button></div></>}
        {kind === 'tags' && ai.out && <div className="row-flex" style={{ flexWrap: 'wrap' }}>
          {tags.length ? tags.map((g) => <button key={g} className="chip sm" onClick={() => setText(text.replace(/\s*$/, '') + ' ' + g)}><I n="add" s={16} />{g}</button>) : <span className="muted small">提案がありません</span>}
          <span className="spacer" /><button className="btn text sm" onClick={() => { setKind(null); ai.reset(); }}>閉じる</button></div>}
      </div>}
    </div>
  );
}
