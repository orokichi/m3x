'use client';
import { use } from 'react';
import { Feed, Header, TweetCard } from '@/components/ui';
import type { XTweet } from '@/lib/types';
export default function List({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ n?: string }> }) {
  const { id } = use(params); const { n } = use(searchParams);
  return (<><Header title={n || 'リスト'} /><Feed<XTweet> op="list" args={{ id }} keyOf={(t) => t.id + (t.rtBy?.id || '')} render={(t) => <TweetCard t={t} />} /></>);
}
