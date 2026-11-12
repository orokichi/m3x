'use client';
import { Feed, Header, TweetCard } from '@/components/ui';
import { useMe } from '@/components/Shell';
import type { XTweet } from '@/lib/types';
export default function Bookmarks() {
  const { me } = useMe();
  return (<><Header title="ブックマーク" sub={me && '@' + me.handle} back={false} /><Feed<XTweet> op="bookmarks" keyOf={(t) => t.id} render={(t) => <TweetCard t={t} />} empty="ブックマークはまだありません" /></>);
}
