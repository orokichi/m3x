'use client';
import { use } from 'react';
import { Feed, Header, TweetCard } from '@/components/ui';
import { DigestButton } from '@/components/AiTools';
import type { XTweet } from '@/lib/types';
export default function List({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ n?: string }> }) {
  const { id } = use(params); const { n } = use(searchParams);
  return (<><Header title={<div className="row-flex" style={{ minWidth: 0 }}><h1 className="ell" style={{ flex: 1 }}>{n || 'リスト'}</h1><DigestButton /></div>} /><Feed<XTweet> op="list" args={{ id }} keyOf={(t) => t.id + (t.rtBy?.id || '')} render={(t) => <TweetCard t={t} />} /></>);
}
