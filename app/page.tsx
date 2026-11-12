'use client';
import { useEffect, useState } from 'react';
import { Feed, Tabs, TweetCard, Icon, UserRow, Spinner } from '@/components/ui';
import { useMe } from '@/components/Shell';
import { x, getFollows } from '@/lib/api';
import type { XTweet, XUser } from '@/lib/types';

function Suggest() {
  const [us, setUs] = useState<XUser[] | null>(null);
  useEffect(() => { x<{ list: XUser[] }>('gusers').then((d) => setUs(d.list)).catch(() => setUs([])); }, []);
  return (
    <>
      <div className="empty" style={{ paddingBottom: 16 }}><Icon n="group_add" s={48} /><h2>フォローしてみよう</h2>
        <p>ゲストモードでは、フォローはこの端末にだけ保存されます。<br />フォローしたアカウントの最新ポストがここに表示されます。</p></div>
      {!us ? <Spinner /> : us.map((u) => <UserRow key={u.id} u={u} />)}
    </>
  );
}

export default function Home() {
  const { authed, ready } = useMe();
  const [tab, setTab] = useState('foryou');
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    const f = () => setIds(getFollows().map((u) => u.id));
    f(); window.addEventListener('m3x-follows', f); return () => window.removeEventListener('m3x-follows', f);
  }, []);
  const guestFollowing = !authed && tab === 'following';
  return (
    <>
      <header className="colhead sticky">
        <div className="ch-row show-sm"><div className="ch-t"><h1 className="brand">M3X</h1></div></div>
        <Tabs tabs={[['foryou', 'おすすめ'], ['following', 'フォロー中']]} value={tab} onChange={setTab} />
      </header>
      {ids === null || !ready ? <Spinner />
        : guestFollowing && !ids.length ? <Suggest />
        : <Feed<XTweet> op="home" args={authed ? { tab } : { tab, ids }} keyOf={(t) => t.id + (t.rtBy?.id || '')} render={(t) => <TweetCard t={t} />}
            empty={guestFollowing ? 'フォロー中のアカウントに最近のポストはありません' : 'ポストがありません'} />}
    </>
  );
}
