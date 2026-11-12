'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Header, Spinner } from '@/components/ui';

const MemoExplorer = dynamic(() => import('@/components/Memo').then((m) => m.MemoExplorer), { ssr: false, loading: () => <Spinner /> });
const SidePanel = dynamic(() => import('@/components/SidePanel'), { ssr: false, loading: () => <Spinner /> });

/** Full page: browse/review all folders, Keep and notes. Narrow screens also get the Agent page (swipe). */
export default function MemoPage() {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => { const mq = window.matchMedia('(min-width: 1061px)'); const f = () => setWide(mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return (
    <>
      <Header title="メモ" back={false} />
      {wide === null ? null : wide ? <div className="memo-page"><MemoExplorer page /></div> : <div className="memo-page"><SidePanel page /></div>}
    </>
  );
}
