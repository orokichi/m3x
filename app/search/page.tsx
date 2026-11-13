'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useMe } from '@/components/Shell';
import { getFollows } from '@/lib/api';
import { useGroq } from '@/lib/ai';
import { useRouter, useSearchParams } from 'next/navigation';
import { Feed, Header, Icon, Spinner, Tabs, TweetCard, UserRow } from '@/components/ui';
import { SearchBar } from '@/components/SearchBar';
import type { XTweet, XUser } from '@/lib/types';

const AiSearch = dynamic(() => import('@/components/SuperSearch'), { ssr: false, loading: () => <Spinner /> });

function Search() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get('q') || '';
  const groq = useGroq();
  const raw = sp.get('f') || 'top';
  const tab = raw === 'ai' && !groq ? 'top' : raw;
  const { authed, ready } = useMe();
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => setIds(getFollows().map((u) => u.id)), []);
  const args = authed ? { q, tab } : { q, tab, ids };
  const handle = q.replace(/^[@＠]/, '');
  const go = (f: string) => router.replace(`/search?q=${encodeURIComponent(q)}&f=${f}`);
  const tabs: [string, string][] = [...(groq ? [['ai', 'AI']] as [string, string][] : []), ['top', '話題'], ['latest', '最新'], ['people', 'ユーザー'], ['media', 'メディア']];
  return (
    <>
      <Header title={<SearchBar q={q} tab={tab} />}>
        <Tabs tabs={tabs} value={tab} onChange={go} />
      </Header>
      {!authed && ready && q && tab !== 'ai' && <div className="muted small" style={{ padding: '12px 16px', borderBottom: '1px solid var(--md-outline-variant)' }}>
        <Icon n="info" s={16} /> ゲストモードでは X 全体の検索はできません。おすすめ・フォロー中アカウントの最近のポストから探しています。
        {/^\w{1,15}$/.test(handle) && <> <Link className="lnk" href={`/u/${handle}`}>@{handle} のプロフィールを開く</Link></>}</div>}
      {!ready ? null : !q ? <div className="empty"><Icon n="search" s={48} /><p>キーワードを入力してください</p></div>
        : tab === 'ai' ? <AiSearch key={q} q={q} />
        : tab === 'people'
          ? <Feed<XUser> op="search" args={args} keyOf={(u) => u.id} render={(u) => <UserRow u={u} />} empty="ユーザーが見つかりません" />
          : <Feed<XTweet> op="search" args={args} keyOf={(t) => t.id} render={(t) => <TweetCard t={t} />} empty={`「${q}」の検索結果はありません`} />}
    </>
  );
}
export default function Page() { return <Suspense><Search /></Suspense>; }
