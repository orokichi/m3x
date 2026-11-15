'use client';
import { useEffect, useState } from 'react';
import { Feed, Tabs, TweetCard, Icon, UserRow, Spinner } from '@/components/ui';
import { useMe, useMQ } from '@/components/Shell';
import { DigestButton } from '@/components/AiTools';
import { deck, DECK_MIN } from '@/lib/deck';
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
  /* Restore the tab the user was on when they return (e.g. back from a post). */
  useEffect(() => { try { const s = sessionStorage.getItem('m3x.homeTab'); if (s === 'foryou' || s === 'following') setTab(s); } catch { /* ignore */ } }, []);
  const changeTab = (v: string) => { setTab(v); try { sessionStorage.setItem('m3x.homeTab', v); } catch { /* ignore */ } };
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    const f = () => setIds(getFollows().map((u) => u.id));
    f(); window.addEventListener('m3x-follows', f); return () => window.removeEventListener('m3x-follows', f);
  }, []);
  const guestFollowing = !authed && tab === 'following';
  const deckWide = useMQ(`(min-width: ${DECK_MIN}px)`);
  return (
    <>
      <header className="colhead sticky">
        <div className="ch-row show-sm"><div className="ch-t"><h1 className="brand">Xplore</h1></div><DigestButton compact /></div>
        <div className="home-tabs"><Tabs tabs={[['foryou', 'おすすめ'], ['following', 'フォロー中']]} value={tab} onChange={changeTab} />
          <div className="home-tools hide-sm"><DigestButton />{deckWide && <button className="icon-btn sm" onClick={() => deck.setOn(true)} title="マルチカラム表示" aria-label="マルチカラム表示"><Icon n="view_column" s={20} /></button>}</div></div>
      </header>
      {ids === null || !ready ? <Spinner />
        : guestFollowing && !ids.length ? <Suggest />
        : <Feed<XTweet> op="home" args={authed ? { tab } : { tab, ids }} keyOf={(t) => t.id + (t.rtBy?.id || '')} render={(t) => <TweetCard t={t} />}
            empty={guestFollowing ? 'フォロー中のアカウントに最近のポストはありません' : 'ポストがありません'} />}
    </>
  );
}
