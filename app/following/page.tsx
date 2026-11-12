'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useMe } from '@/components/Shell';
import { Avatar, Feed, Header, Icon, TweetCard } from '@/components/ui';
import { AiText } from '@/components/AiText';
import { x, getFollows, img } from '@/lib/api';
import { groq, compact, useGroq, type Msg } from '@/lib/ai';
import type { XTweet, XUser, Page } from '@/lib/types';

type Acc = { id: string; handle: string; name: string; avatar?: string };
const SYS = 'あなたはユーザーがフォローしているXアカウントの最新ポストを整理するアシスタントです。日本語で簡潔に答えてください。根拠のポストがあれば [番号] で示し、推測はしない。';
const NEED_POSTS = /誰|だれ|どの|どれ|詳しく|詳細|具体|ポスト|投稿|リンク|URL|@|引用|原文|画像|いつ|何件/;

function Summary({ posts, loadPosts }: { posts: XTweet[] | null; loadPosts: () => Promise<XTweet[]> }) {
  const [sum, setSum] = useState('');
  const [hist, setHist] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const cite = (n: number) => (posts?.[n - 1] ? `/status/${posts[n - 1].id}` : undefined);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [hist.length, busy]);

  const summarize = async () => {
    setBusy(true); setErr(''); setSum(''); setHist([]);
    try {
      const ps = await loadPosts();
      if (!ps.length) { setErr('要約できるポストがありません'); return; }
      setSum(await groq([{ role: 'system', content: SYS }, { role: 'user', content: `次のポストを話題ごとに要点だけ箇条書きで要約（最大7項目）:\n${compact(ps, 30, 130)}` }], { tier: 'large', max: 450 }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const ask = async () => {
    const t = q.trim(); if (!t || busy) return;
    const h: Msg[] = [...hist, { role: 'user', content: t }]; setHist(h); setQ(''); setBusy(true); setErr('');
    try {
      const ctx = `要約:\n${sum}` + (NEED_POSTS.test(t) && posts?.length ? `\n\n元のポスト(抜粋):\n${compact(posts, 30, 90)}` : '');
      const a = await groq([{ role: 'system', content: SYS }, { role: 'user', content: ctx }, { role: 'assistant', content: 'はい、この内容について答えます。' }, ...h.slice(-6)], { tier: 'large', max: 320 });
      setHist([...h, { role: 'assistant', content: a }]);
    } catch (e: any) { setErr(e.message); setHist(hist); setQ(t); } finally { setBusy(false); }
  };

  return (
    <section className="ai-card">
      <div className="ai-h"><Icon n="auto_awesome" fill /><b>AI 要約</b><span className="spacer" />
        <button className="btn filled sm" onClick={summarize} disabled={busy}><Icon n={sum ? 'refresh' : 'summarize'} />{sum ? '再要約' : '最新ポストを要約'}</button></div>
      {!sum && !busy && !err && <p className="muted small" style={{ margin: 0 }}>フォロー中アカウントの最新ポスト（最大30件）を AI がまとめます。</p>}
      {busy && !sum && <div className="ai-skel"><i /><i /><i /></div>}
      {err && <p className="c-err small">{err}</p>}
      {sum && <AiText text={sum} hrefOf={cite} />}
      {sum && <>
        {hist.map((m, i) => <div key={i} className={'ai-msg ' + m.role}>{m.role === 'user' ? m.content : <AiText text={m.content} hrefOf={cite} />}</div>)}
        {busy && <div className="ai-msg assistant"><div className="ai-skel"><i /><i /></div></div>}
        <div ref={end} />
        <form className="ai-ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="この要約について質問…" aria-label="質問" disabled={busy} />
          <button className="icon-btn filled" type="submit" disabled={busy || !q.trim()} aria-label="送信"><Icon n="arrow_upward" /></button>
        </form>
      </>}
    </section>
  );
}

export default function Following() {
  const { authed, ready, me } = useMe();
  const has = useGroq();
  const [accs, setAccs] = useState<Acc[] | null>(null);
  const [posts, setPosts] = useState<XTweet[] | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (!authed) { const f = () => setAccs(getFollows()); f(); window.addEventListener('m3x-follows', f); return () => window.removeEventListener('m3x-follows', f); }
    if (me) x<Page<XUser>>('follows', { kind: 'following', id: me.id }).then((p) => setAccs(p.list)).catch(() => setAccs([]));
  }, [ready, authed, me]);
  const ids = authed ? undefined : (accs || []).map((a) => a.id);
  const args = authed ? { tab: 'following' } : { tab: 'following', ids };
  const loadPosts = async () => { const p = (await x<Page<XTweet>>('home', args)).list.slice(0, 30); setPosts(p); return p; };

  return (
    <>
      <Header title="フォロー" sub={accs ? `${accs.length}${accs.length >= 40 && authed ? '+' : ''} アカウント${authed ? '' : '（この端末に保存）'}` : undefined} back={false} />
      {accs && !!accs.length && <div className="fchips" role="list">{accs.map((a) => (
        <Link key={a.id} role="listitem" href={`/u/${a.handle}`} className="fchip sl" title={`${a.name} @${a.handle}`}>
          {a.avatar ? <img className="av" src={img(a.avatar)} alt="" width={28} height={28} referrerPolicy="no-referrer" loading="lazy" /> : <Avatar size={28} />}
          <span className="ell">{a.name}</span>
        </Link>))}</div>}
      {has && accs && (authed || accs.length > 0) && <Summary key={String(authed)} posts={posts} loadPosts={loadPosts} />}
      {!ready || accs === null ? null
        : !authed && !accs.length ? <div className="empty"><Icon n="group_add" s={48} /><h2>まだ誰もフォローしていません</h2><p>ゲストモードのフォローはこの端末に保存されます。<br />ホームの「おすすめ」や検索からアカウントをフォローしてください。</p><Link className="btn filled" href="/">ホームへ</Link></div>
        : <Feed<XTweet> op="home" args={args} keyOf={(t) => t.id + (t.rtBy?.id || '')} render={(t) => <TweetCard t={t} />} empty="フォロー中のアカウントに最近のポストはありません" />}
    </>
  );
}
