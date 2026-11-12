'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMe } from '@/components/Shell';
import { Header, Icon, Spinner, TweetCard } from '@/components/ui';
import { AiText } from '@/components/AiText';
import { x, getFollows } from '@/lib/api';
import { groq, parseJson, compact, useGroq } from '@/lib/ai';
import type { XTweet, Page } from '@/lib/types';

interface Plan { query?: string; keywords?: string[]; accounts?: string[]; since?: string | null; min_faves?: number; media?: boolean; lang?: string | null; sort?: string }

const EXAMPLES = ['最近1週間で話題になった生成AIのニュース', '@Nintendo の新作発表で画像つきのポスト', '天気・地震に関する速報を日本語で'];

const PLAN_SYS = (today: string) => `あなたはX(旧Twitter)の検索クエリ生成器です。ユーザーの要望を次のJSONだけで返してください。
{"query":"X検索演算子を含む検索文字列","keywords":["本文に含まれそうな語（同義語・表記ゆれ含む、最大6語）"],"accounts":["関係するアカウントのハンドル（@なし、分かる場合のみ）"],"since":"YYYY-MM-DD または null","min_faves":0,"media":false,"lang":"ja/en/null","sort":"top か latest"}
使える演算子: from: to: since: until: min_faves: min_retweets: filter:media filter:images filter:videos filter:links lang: -filter:replies OR "完全一致" -除外語
今日は${today}。「最近」は7日前、「今日」は今日の日付を since にする。`;

const SUM_SYS = '与えられたXのポスト一覧だけを根拠に、ユーザーの要望へ日本語で簡潔に答えてください（最大6行、箇条書き可）。根拠のポストは [番号] で引用。一覧にない情報は推測しない。該当が薄ければそう述べる。';

const JA = /[\u3040-\u30ff\u4e00-\u9fff]/;

function localFilter(list: XTweet[], p: Plan) {
  const kws = (p.keywords || []).map((k) => k.toLowerCase().replace(/^[#＃]/, '')).filter(Boolean);
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
  const score = (t: XTweet) => { const s = (t.text + ' ' + t.user.name).toLowerCase(); return kws.filter((k) => s.includes(k)).length; };
  let out = base.filter((t) => (acc.size ? acc.has(t.user.handle.toLowerCase()) : true) && (!kws.length || score(t) > 0));
  if (!out.length && acc.size) out = base.filter((t) => acc.has(t.user.handle.toLowerCase()));
  if (!out.length && kws.length && acc.size) out = base.filter((t) => score(t) > 0);
  out.sort(p.sort === 'latest' ? (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) : (a, b) => score(b) - score(a) || b.likes + b.retweets - (a.likes + a.retweets));
  return out;
}

export default function SuperSearch() {
  const { authed, ready } = useMe();
  const has = useGroq();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<'' | 'plan' | 'search' | 'sum' | 'done'>('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [posts, setPosts] = useState<XTweet[]>([]);
  const [answer, setAnswer] = useState('');
  const [err, setErr] = useState('');

  const run = async (text = q) => {
    const req = text.trim(); if (!req || (stage && stage !== 'done')) return;
    setQ(req); setErr(''); setAnswer(''); setPosts([]); setPlan(null); setStage('plan');
    try {
      const today = new Date().toLocaleDateString('sv-SE');
      const p = parseJson<Plan>(await groq([{ role: 'system', content: PLAN_SYS(today) }, { role: 'user', content: req }], { tier: 'small', max: 220, json: true, temperature: 0.1 })) || { query: req, keywords: req.split(/\s+/) };
      if (!p.query) p.query = (p.keywords || [req]).join(' ');
      setPlan(p); setStage('search');
      let list: XTweet[] = [];
      if (authed) {
        const tab = p.sort === 'latest' ? 'latest' : 'top';
        list = (await x<Page<XTweet>>('search', { q: p.query, tab })).list;
        if (!list.length && p.keywords?.length) list = (await x<Page<XTweet>>('search', { q: p.keywords.slice(0, 6).join(' OR '), tab })).list;
      } else {
        const pool = (await x<Page<XTweet>>('gpool', { ids: getFollows().map((u) => u.id), handles: p.accounts || [] })).list;
        list = localFilter(pool, p);
      }
      list = list.slice(0, 30);
      setPosts(list);
      if (!list.length) { setStage('done'); return; }
      setStage('sum');
      setAnswer(await groq([{ role: 'system', content: SUM_SYS }, { role: 'user', content: `要望: ${req}\n\nポスト:\n${compact(list, 30, 140)}` }], { tier: 'large', max: 450 }));
      setStage('done');
    } catch (e: any) { setErr(e.message); setStage('done'); }
  };

  if (!has) return (<><Header title="Super Search" back={false} /><div className="empty"><Icon n="auto_awesome" s={48} /><h2>Groq の API キーが必要です</h2><p>設定で Groq Console の API キーを登録すると使えます。</p><Link className="btn filled" href="/settings#ai">設定を開く</Link></div></>);

  const busy = stage && stage !== 'done';
  return (
    <>
      <Header title="Super Search" sub="AI が検索条件を考えて X を探します" back={false}>
        <form className="ss-box" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <Icon n="auto_awesome" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例: 最近のゲーム発表で画像つきの人気ポスト" aria-label="Super Search" />
          <button className="icon-btn filled" type="submit" disabled={!!busy || !q.trim()} aria-label="検索"><Icon n="arrow_upward" /></button>
        </form>
      </Header>
      {!stage && <div className="pad">
        {ready && !authed && <div className="muted small"><Icon n="info" s={16} /> ゲストモードでは X 全体は検索できないため、おすすめ・フォロー中アカウントの最近のポストから AI の条件で探します。</div>}
        <div className="chips" style={{ flexWrap: 'wrap' }}>{EXAMPLES.map((e) => <button key={e} className="chip sl" onClick={() => run(e)}>{e}</button>)}</div>
      </div>}
      {plan && <div className="ss-plan">
        <span className="muted small">検索条件</span>
        <code className="ss-q">{plan.query}</code>
        {!authed && !!plan.keywords?.length && <span className="muted small ell">キーワード: {plan.keywords.join(' / ')}</span>}
      </div>}
      {(stage === 'sum' || answer || err) && <section className="ai-card">
        <div className="ai-h"><Icon n="auto_awesome" fill /><b>AI の回答</b></div>
        {stage === 'sum' ? <div className="ai-skel"><i /><i /><i /></div> : err ? <p className="c-err">{err}</p> : <AiText text={answer} anchor="ss" />}
      </section>}
      {(stage === 'plan' || stage === 'search') && <><p className="muted small" style={{ textAlign: 'center' }}>{stage === 'plan' ? '検索条件を考えています…' : 'ポストを探しています…'}</p><Spinner /></>}
      {stage === 'done' && !err && !posts.length && <div className="empty"><Icon n="search_off" s={48} /><p>条件に合うポストが見つかりませんでした。<br />言い方を変えて試してください。</p></div>}
      {posts.map((t, i) => <div key={t.id} id={`ss-${i + 1}`} className="ss-item"><span className="ss-n">{i + 1}</span><TweetCard t={t} /></div>)}
    </>
  );
}
