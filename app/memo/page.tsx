'use client';
import Link from 'next/link';
import { Header, Icon } from '@/components/ui';
import { MemoExplorer } from '@/components/Memo';
import { useMemoOn } from '@/lib/memo';

export default function MemoPage() {
  const on = useMemoOn();
  return (
    <>
      <Header title="メモ" back={false} />
      {on ? <div className="memo-page"><MemoExplorer page /></div>
        : <div className="empty"><Icon n="sticky_note_2" s={48} /><h2>メモ機能はオフです</h2><p>設定で「メモ機能」をオンにすると使えます。</p><Link className="btn filled" href="/settings#memo">設定を開く</Link></div>}
    </>
  );
}
