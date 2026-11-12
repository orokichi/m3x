'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { x, fmtNum, img } from '@/lib/api';
import { Avatar, ErrorBox, Feed, FollowBtn, Header, Icon, Spinner, Tabs, TweetCard, Verified, RichText } from '@/components/ui';
import { useMe } from '@/components/Shell';
import type { XTweet, XUser } from '@/lib/types';

export default function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { me } = useMe();
  const [u, setU] = useState<XUser | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  const [tab, setTab] = useState('posts');
  const load = () => { setErr(null); setU(null); x<XUser>('user', { handle }).then(setU).catch(setErr); };
  useEffect(load, [handle]);
  const mine = !!me && !!u && me.id === u.id;
  const tabs: [string, string][] = [['posts', 'ポスト'], ['replies', '返信'], ['media', 'メディア']];
  if (mine) tabs.push(['likes', 'いいね']);
  return (
    <>
      <Header title={u?.name || '@' + handle} sub={u && `${fmtNum(u.tweets)} 件のポスト`} />
      {err && <ErrorBox e={err} retry={load} />}
      {!u && !err && <Spinner />}
      {u && <>
        <div className="banner">{u.banner && <img src={img(u.banner + '/1500x500')} alt="" referrerPolicy="no-referrer" />}</div>
        <div className="pf">
          <div className="pf-top"><div className="pf-av"><Avatar u={u} size={128} /></div>{mine ? <a className="btn outlined" href="https://x.com/settings/profile" target="_blank" rel="noreferrer">プロフィールを編集</a> : <FollowBtn u={u} lg />}</div>
          <h2 className="pf-name">{u.name}{u.verified && <Verified />}</h2>
          <div className="muted">@{u.handle}{u.followsYou && <span className="tag">フォローされています</span>}</div>
          {u.bio && <p className="pf-bio"><RichText t={{ text: u.bio, urls: [] }} /></p>}
          <div className="pf-meta muted">
            {u.location && <span><Icon n="location_on" s={18} />{u.location}</span>}
            {u.url && <a className="lnk" href={u.url} target="_blank" rel="noreferrer"><Icon n="link" s={18} />{u.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>}
            {u.createdAt && <span><Icon n="calendar_month" s={18} />{new Date(u.createdAt).getFullYear()}年{new Date(u.createdAt).getMonth() + 1}月から利用</span>}
          </div>
          <div className="pf-counts">
            <Link href={`/u/${u.handle}/following`}><b>{fmtNum(u.following)}</b> <span className="muted">フォロー中</span></Link>
            <Link href={`/u/${u.handle}/followers`}><b>{fmtNum(u.followers)}</b> <span className="muted">フォロワー</span></Link>
          </div>
        </div>
        <div className="sticky-tabs"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
        {tab === 'media'
          ? <Feed<XTweet> op="utweets" args={{ id: u.id, tab }} keyOf={(t) => t.id} render={(t) => <TweetCard t={t} />} empty="メディアはありません" />
          : <Feed<XTweet> op="utweets" args={{ id: u.id, tab }} keyOf={(t) => t.id + (t.rtBy?.id || '')} render={(t) => <TweetCard t={t} />} empty="ポストはありません" />}
      </>}
    </>
  );
}
