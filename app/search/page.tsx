'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMe } from '@/components/Shell';
import { getFollows } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { Feed, Header, Icon, Tabs, TweetCard, UserRow } from '@/components/ui';
import type { XTweet, XUser } from '@/lib/types';

function Search() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get('q') || '';
  const tab = sp.get('f') || 'top';
  const [v, setV] = useState(q);
  const { authed, ready } = useMe();
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => setIds(getFollows().map((u) => u.id)), []);
  const args = authed ? { q, tab } : { q, tab, ids };
  const handle = q.replace(/^[@＠]/, '');
  useEffect(() => setV(q), [q]);
  const go = (nq: string, f = tab) => router.replace(`/search?q=${encodeURIComponent(nq)}&f=${f}`);
  return (
    <>
      <Header title={<form className="sbox wide" onSubmit={(e) => { e.preventDefault(); if (v.trim()) go(v.trim()); }}>
          <Icon n="search" /><input value={v} onChange={(e) => setV(e.target.value)} placeholder="検索" />
        </form>}>
        <Tabs tabs={[['top', '話題'], ['latest', '最新'], ['people', 'ユーザー'], ['media', 'メディア']]} value={tab} onChange={(f) => go(q, f)} />
      </Header>
      {!authed && ready && q && <div className="muted small" style={{ padding: '12px 16px', borderBottom: '1px solid var(--md-outline-variant)' }}>
        <Icon n="info" s={16} /> ゲストモードでは X 全体の検索はできません。おすすめ・フォロー中アカウントの最近のポストから探しています。
        {/^\w{1,15}$/.test(handle) && <> <Link className="lnk" href={`/u/${handle}`}>@{handle} のプロフィールを開く</Link></>}</div>}
      {!ready ? null : !q ? <div className="empty"><Icon n="search" s={48} /><p>キーワードを入力してください</p></div>
        : tab === 'people'
          ? <Feed<XUser> op="search" args={args} keyOf={(u) => u.id} render={(u) => <UserRow u={u} />} empty="ユーザーが見つかりません" />
          : <Feed<XTweet> op="search" args={args} keyOf={(t) => t.id} render={(t) => <TweetCard t={t} />} empty={`「${q}」の検索結果はありません`} />}
    </>
  );
}
export default function Page() { return <Suspense><Search /></Suspense>; }
