'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { x, fmtNum } from '@/lib/api';
import { ErrorBox, Icon, Spinner } from '@/components/ui';
import type { XTrend } from '@/lib/types';

export default function Explore() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [t, setT] = useState<XTrend[] | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  useEffect(() => { x<XTrend[]>('trends').then(setT).catch(setErr); }, []);
  return (
    <>
      <header className="colhead sticky">
        <form className="sbox wide" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <Icon n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="検索" autoFocus />
        </form>
      </header>
      <h2 className="sec-h">日本のトレンド</h2>
      {err && <ErrorBox e={err} />}
      {!t && !err && <Spinner />}
      {t?.map((tr, i) => (
        <Link key={tr.name} href={`/search?q=${encodeURIComponent(tr.query)}`} className="trend sl">
          <span className="muted small">{i + 1} · 日本のトレンド</span><b>{tr.name}</b>{tr.volume && <span className="muted small">{fmtNum(tr.volume)}件のポスト</span>}
        </Link>
      ))}
    </>
  );
}
