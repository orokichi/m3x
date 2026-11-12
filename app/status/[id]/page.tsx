'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { x, fmtFull, fmtNum } from '@/lib/api';
import { Actions, Avatar, ErrorBox, Feed, Header, MediaGrid, RichText, Spinner, TweetCard, Verified, FollowBtn } from '@/components/ui';
import { compose, useMe } from '@/components/Shell';
import type { XTweet } from '@/lib/types';

export default function Status({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const [d, setD] = useState<{ tweet: XTweet; parents: XTweet[] } | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  const load = () => { setErr(null); setD(null); x('tweet', { id }).then(setD).catch(setErr); };
  useEffect(load, [id]);
  const t = d?.tweet;
  return (
    <>
      <Header title="ポスト" />
      {err && <ErrorBox e={err} retry={load} />}
      {!d && !err && <Spinner />}
      {t && <>
        {d!.parents.map((p) => <TweetCard key={p.id} t={p} thread />)}
        <article className="tweet main">
          <div className="row-flex" style={{ gap: 10 }}>
            <Link href={`/u/${t.user.handle}`}><Avatar u={t.user} /></Link>
            <div className="ur-t" style={{ flex: 1 }}><Link href={`/u/${t.user.handle}`} className="row-flex" style={{ gap: 4 }}><b>{t.user.name}</b>{t.user.verified && <Verified />}</Link><span className="muted">@{t.user.handle}</span></div>
            {me?.id !== t.user.id && <FollowBtn u={t.user} />}
          </div>
          {t.text && <div className="tw-text xl"><RichText t={t} /></div>}
          <MediaGrid media={t.media} />
          {t.quoted && <TweetCard t={t.quoted} />}
          <div className="muted meta-line">{fmtFull(t.createdAt)}{t.views != null && <> · <b className="c-on">{fmtNum(t.views)}</b> 件の表示</>}</div>
          <div className="stats">
            <span><b>{fmtNum(t.retweets)}</b> 件のリポスト</span><span><b>{fmtNum(t.quotes)}</b> 件の引用</span>
            <span><b>{fmtNum(t.likes)}</b> 件のいいね</span><span><b>{fmtNum(t.bookmarks)}</b> 件のブックマーク</span>
          </div>
          <Actions t={t} big />
        </article>
        <button className="reply-bar sl" onClick={() => compose({ replyTo: t })}><span className="muted">返信をポスト</span><span className="btn filled sm">返信</span></button>
        <Feed<XTweet> op="replies" args={{ id }} keyOf={(r) => r.id} render={(r) => <TweetCard t={r} />} empty="まだ返信はありません" />
      </>}
    </>
  );
}
