'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Feed, Header, Icon, Tabs, TweetCard, UserRow } from '@/components/ui';
import type { XTweet, XUser } from '@/lib/types';

function Search() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get('q') || '';
  const tab = sp.get('f') || 'top';
  const [v, setV] = useState(q);
  useEffect(() => setV(q), [q]);
  const go = (nq: string, f = tab) => router.replace(`/search?q=${encodeURIComponent(nq)}&f=${f}`);
  return (
    <>
      <Header title={<form className="sbox wide" onSubmit={(e) => { e.preventDefault(); if (v.trim()) go(v.trim()); }}>
          <Icon n="search" /><input value={v} onChange={(e) => setV(e.target.value)} placeholder="検索" />
        </form>}>
        <Tabs tabs={[['top', '話題'], ['latest', '最新'], ['people', 'ユーザー'], ['media', 'メディア']]} value={tab} onChange={(f) => go(q, f)} />
      </Header>
      {!q ? <div className="empty"><Icon n="search" s={48} /><p>キーワードを入力してください</p></div>
        : tab === 'people'
          ? <Feed<XUser> op="search" args={{ q, tab }} keyOf={(u) => u.id} render={(u) => <UserRow u={u} />} empty="ユーザーが見つかりません" />
          : <Feed<XTweet> op="search" args={{ q, tab }} keyOf={(t) => t.id} render={(t) => <TweetCard t={t} />} empty={`「${q}」の検索結果はありません`} />}
    </>
  );
}
export default function Page() { return <Suspense><Search /></Suspense>; }
