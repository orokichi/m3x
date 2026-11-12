'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Feed, Tabs, TweetCard, Icon } from '@/components/ui';
import { useMe } from '@/components/Shell';
import type { XTweet } from '@/lib/types';

export default function Home() {
  const { authed } = useMe();
  const [tab, setTab] = useState('foryou');
  return (
    <>
      <header className="colhead sticky">
        <div className="ch-row show-sm"><div className="ch-t"><h1 className="brand">M3X</h1></div></div>
        <Tabs tabs={[['foryou', 'おすすめ'], ['following', 'フォロー中']]} value={tab} onChange={setTab} />
      </header>
      {authed
        ? <Feed<XTweet> op="home" args={{ tab }} keyOf={(t) => t.id + (t.rtBy?.id || '')} render={(t) => <TweetCard t={t} />} />
        : <div className="empty"><Icon n="waving_hand" s={56} /><h2>M3X へようこそ</h2><p>タイムラインを見るには、X の Cookie を設定してください。<br />ログインしなくても、プロフィール・ポスト詳細・トレンドは見られます。</p>
            <Link href="/settings" className="btn filled lg">セットアップを始める</Link></div>}
    </>
  );
}
