'use client';
import { useEffect, useRef, useState } from 'react';
import { useMe } from '@/components/Shell';
import { Icon, TweetCard } from '@/components/ui';
import { AiText } from '@/components/AiText';
import { x, getFollows, toast } from '@/lib/api';
import { groq, parseJson, compact } from '@/lib/ai';
import type { XTweet, Page } from '@/lib/types';

/* AI search (merged former Super Search): plan with the small model → fetch → re-rank/group → summary card. */

interface Plan { query?: string; keywords?: string[]; accounts?: string[]; since?: string | null; min_faves?: number; media?: boolean; lang?: string | null; sort?: string }
interface Sum { title?: string; tldr?: string; points?: { t: string; refs?: number[] }[]; top?: number[]; off?: number[] }

const PLAN_SYS = (today: string) => `X検索クエリ生成器。要望を次のJSONだけで返す。
{"query":"X検索演算子を含む検索文字列","keywords":["本文に出そうな語・同義語(最大6)"],"accounts":["関係アカウント(@なし,分かる時のみ)"],"since":"YYYY-MM-DD|null","min_faves":0,"media":false,"lang":"ja|en|null","sort":"top|latest"}
演算子: from: since: until: min_faves: filter:media filter:images lang: -filter:replies OR "完全一致" -除外語
今日は${today}。「最近」=7日前、「今日」=今日をsinceに。`;

const SUM_SYS = `Xのポスト一覧だけを根拠に、要望への要約を日本語JSONだけで返す。
{"title":"15字以内の見出し","tldr":"2〜3文の要点","points":[{"t":"30字以内の要点","refs":[番号]}],"top":[最も関連する番号を最大3],"off":[要望と無関係な番号]}
pointsは最大4。一覧にない情報は書かない。該当が薄ければtldrでそう述べる。`;

const ASK_SYS = '与えられたXのポスト一覧だけを根拠に、追加の質問へ日本語で簡潔に答える（最大4行）。根拠は [番号] で引用。一覧にない情報は推測しない。';

const JA = /[\u3040-\u30ff\u4e00-\u9fff]/;
const CAP = 24;

function score(t: XTweet, kws: string[]) { const s = (t.text + ' ' + t.user.name).toLowerCase(); return kws.filter((k) => s.includes(k)).length; }
const kwsOf = (p: Plan) => (p.keywords || []).map((k) => k.toLowerCase().replace(/^[#＃]/, '')).filter(Boolean);

function localFilter(list: XTweet[], p: Plan) {
  const kws = kwsOf(p);
  const acc = new Set([...(p.accounts || []), ...Array.from((p.query || '').matchAll(/from:@?(\w{1,15})/gi), (m) => m[1])].map((h) => h.replace(/^@/, '').toLowerCase()));
  const since = p.since ? Date.parse(p.since) : NaN;
  const base = list.filter((t) => {
    if (!isNaN(since) && Date.parse(t.createdAt) < since) return false;
    if (p.min_faves && t.likes < p.min_faves) return false;
    if (p.media && !t.media.length) return false;
    if (p.lang === 'ja' && !JA.test(t.text)) return false;
    if (p.lang === 'en' && JA.test(t.text)) return false;
    return true;
  });
  let out = base.filter((t) => (acc.size ? acc.has(t.user.handle.toLowerCase()) : true) && (!kws.length || score(t, kws) > 0));
  if (!out.length && acc.size) out = base.filter((t) => acc.has(t.user.handle.toLowerCase()));
  if (!out.length && kws.length && acc.size) out = base.filter((t) => score(t, kws) > 0);
  return out;
}

/** Relevance = keyword hits first, then engagement. */
const rank = (list: XTweet[], p: Plan) => { const kws = kwsOf(p); return [...list].sort((a, b) => score(b, kws) - score(a, kws) || b.likes + b.retweets * 2 - (a.likes + a.retweets * 2)); };

type Group = { k: string; label: string; icon: string; items: number[] };
function groupOf(posts: XTweet[], s: Sum | null, p: Plan): Group[] {
  const n = posts.length, off = new Set((s?.off || []).filter((i) => i >= 1 && i <= n));
  if (off.size >= n) off.clear();
  const ok = Array.from({ length: n }, (_, i) => i + 1).filter((i) => !off.has(i));
  const kws = kwsOf(p), eng = (i: number) => posts[i - 1].likes + posts[i - 1].retweets * 2;
  let top = (s?.top || []).filter((i) => ok.includes(i)).slice(0, 3);
  if (!top.length) top = [...ok].sort((a, b) => score(posts[b - 1], kws) - score(posts[a - 1], kws) || eng(b) - eng(a)).slice(0, 3);
  const rest = ok.filter((i) => !top.includes(i));
  const latest = [...rest].sort((a, b) => +new Date(posts[b - 1].createdAt) - +new Date(posts[a - 1].createdAt)).slice(0, rest.length > 6 ? 5 : 0);
  const rel = rest.filter((i) => !latest.includes(i));
  return [
    { k: 'top', label: '注目', icon: 'local_fire_department', items: top },
    { k: 'latest', label: '最新', icon: 'schedule', items: latest },
    { k: 'rel', label: '関連', icon: 'link', items: rel },
  ].filter((g) => g.items.length);
}

const jump = (n: number) => {
  const el = document.getElementById(`as-${n}`); if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
};

function Cites({ refs, max }: { refs?: number[]; max: number }) {
  const r = Array.from(new Set((refs || []).filter((n) => n >= 1 && n <= max))).slice(0, 4);
  return <>{r.map((n) => <button key={n} type="button" className="cite" onClick={() => jump(n)} aria-label={`ポスト ${n} へ移動`}>{n}</button>)}</>;
}

/** M3 Expressive loading indicator: a shape that morphs between rounded polygons while spinning. */
export const Morph = ({ s = 36 }: { s?: number }) => <span className="m3-morph" style={{ width: s, height: s }} role="progressbar" aria-label="読み込み中"><i /></span>;

export default function SuperSearch({ q }: { q: string }) {
  const { authed, ready } = useMe();
  const [stage, setStage] = useState<'plan' | 'search' | 'sum' | 'done'>('plan');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [posts, setPosts] = useState<XTweet[]>([]);
  const [sum, setSum] = useState<Sum | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(true);
  const [ask, setAsk] = useState('');
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return; started.current = true;
    (async () => {
      try {
        const today = new Date().toLocaleDateString('sv-SE');
        const p = parseJson<Plan>(await groq([{ role: 'system', content: PLAN_SYS(today) }, { role: 'user', content: q }], { tier: 'small', max: 200, json: true, temperature: 0.1 })) || { query: q, keywords: q.split(/\s+/) };
        if (!p.query) p.query = (p.keywords || [q]).join(' ');
        setPlan(p); setStage('search');
        let list: XTweet[] = [];
        if (authed) {
          const [a, b] = await Promise.all([
            x<Page<XTweet>>('search', { q: p.query, tab: 'top' }).then((r) => r.list).catch(() => []),
            x<Page<XTweet>>('search', { q: p.query, tab: 'latest' }).then((r) => r.list).catch(() => []),
          ]);
          const seen = new Set<string>(); list = [...a, ...b].filter((t) => !seen.has(t.id) && !!seen.add(t.id));
          if (!list.length && p.keywords?.length) list = (await x<Page<XTweet>>('search', { q: p.keywords.slice(0, 6).join(' OR '), tab: 'top' })).list;
        } else {
          const pool = (await x<Page<XTweet>>('gpool', { ids: getFollows().map((u) => u.id), handles: p.accounts || [] })).list;
          list = localFilter(pool, p);
        }
        list = rank(list, p).slice(0, CAP);
        setPosts(list);
        if (!list.length) { setStage('done'); return; }
        setStage('sum');
        const s = parseJson<Sum>(await groq([{ role: 'system', content: SUM_SYS }, { role: 'user', content: `要望: ${q}\n\nポスト:\n${compact(list, CAP, 110)}` }], { tier: 'large', max: 420, json: true, temperature: 0.2 }));
        setSum(s || { tldr: '要約を生成できませんでした。' });
        setStage('done');
      } catch (e: any) { setErr(e.message); setStage('done'); }
    })();
  }, [ready, authed, q]);

  const followUp = async () => {
    const fq = ask.trim(); if (!fq || asking || !posts.length) return;
    setAsk(''); setAsking(true); setQa((v) => [...v, { q: fq, a: '' }]);
    try {
      const a = await groq([{ role: 'system', content: ASK_SYS }, { role: 'user', content: `元の要望: ${q}\n要約: ${sum?.tldr || ''}\n\nポスト:\n${compact(posts, CAP, 100)}\n\n質問: ${fq}` }], { tier: 'large', max: 300 });
      setQa((v) => v.map((m, i) => (i === v.length - 1 ? { ...m, a } : m)));
    } catch (e: any) { setQa((v) => v.map((m, i) => (i === v.length - 1 ? { ...m, a: `⚠ ${e.message}` } : m))); }
    setAsking(false);
  };

  const copy = () => {
    if (!sum) return;
    const txt = [sum.title, sum.tldr, ...(sum.points || []).map((p) => `・${p.t}`), ...qa.flatMap((m) => [`Q. ${m.q}`, m.a])].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(txt).then(() => toast('要約をコピーしました'), () => toast('コピーできませんでした'));
  };

  const loading = stage !== 'done';
  const groups = stage === 'done' && posts.length ? groupOf(posts, sum, plan || {}) : [];
  const label = stage === 'plan' ? '検索条件を考えています' : stage === 'search' ? 'X を探しています' : '要約しています';

  return (
    <div className="as">
      {(loading || sum || err) && <section className={'as-card' + (open ? '' : ' closed')} aria-busy={loading}>
        <div className="as-top">
          <span className="as-badge">{loading ? <Morph s={26} /> : <Icon n="auto_awesome" s={20} fill />}</span>
          <div className="as-ttl">
            <span className="as-kick">AI 要約</span>
            {loading ? <i className="sk sk-t" /> : <h2>{err ? 'エラー' : sum?.title || q}</h2>}
          </div>
          {!loading && sum && <button type="button" className="icon-btn" onClick={copy} aria-label="要約をコピー" title="コピー"><Icon n="content_copy" s={20} /></button>}
          <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? '折りたたむ' : '展開する'}><Icon n={open ? 'expand_less' : 'expand_more'} /></button>
        </div>
        {open && <div className="as-body">
          {loading ? <>
            <p className="as-stage">{label}…</p>
            <div className="as-skel"><i className="sk" /><i className="sk" /><i className="sk" style={{ width: '62%' }} /></div>
            <div className="as-chips"><i className="sk sk-c" /><i className="sk sk-c" /><i className="sk sk-c" /></div>
          </> : err ? <p className="ss-err"><Icon n="error" s={18} /><span>{err}</span></p> : sum && <>
            {sum.tldr && <p className="as-tldr">{sum.tldr}</p>}
            {!!sum.points?.length && <ul className="as-pts">{sum.points.slice(0, 4).map((p, i) => <li key={i}><span className="as-dot" /><span className="as-pt">{p.t}</span><Cites refs={p.refs} max={posts.length} /></li>)}</ul>}
            {qa.map((m, i) => <div key={i} className="as-qa"><div className="ai-msg user">{m.q}</div>{m.a ? <div className="ai-msg assistant"><AiText text={m.a} anchor="as" /></div> : <div className="as-skel sm"><i className="sk" /><i className="sk" style={{ width: '70%' }} /></div>}</div>)}
            {!!posts.length && <form className="ai-ask as-ask" onSubmit={(e) => { e.preventDefault(); followUp(); }}>
              <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="この結果について質問…" aria-label="追加の質問" />
              <button className="icon-btn filled" type="submit" disabled={asking || !ask.trim()} aria-label="送信">{asking ? <Morph s={20} /> : <Icon n="arrow_upward" s={20} />}</button>
            </form>}
          </>}
        </div>}
      </section>}
      {plan && <div className="as-plan" title={plan.query}><Icon n="filter_alt" s={16} /><code>{plan.query}</code></div>}
      {stage === 'done' && !err && !posts.length && <div className="empty"><Icon n="search_off" s={48} /><h2>見つかりませんでした</h2><p>条件に合うポストがありませんでした。<br />言い方を変えて試してください。</p></div>}
      {groups.map((g) => <section key={g.k} className="as-group">
        <div className="as-gh"><Icon n={g.icon} s={18} fill /><b>{g.label}</b><span className="cnt">{g.items.length}</span></div>
        {g.items.map((n) => <div key={posts[n - 1].id} id={`as-${n}`} className="ss-item"><span className="ss-n">{n}</span><TweetCard t={posts[n - 1]} /></div>)}
      </section>)}
      {ready && !authed && stage === 'done' && !!posts.length && <p className="muted small" style={{ padding: '12px 16px' }}><Icon n="info" s={16} /> ゲストモードのため、おすすめ・フォロー中アカウントの最近のポストから探しています。</p>}
    </div>
  );
}
