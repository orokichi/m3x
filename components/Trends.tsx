'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { x, fmtNum } from '@/lib/api';
import type { XTrend } from '@/lib/types';
import { TrendWhy } from './AiTools';

let cache: { at: number; list: XTrend[] } | null = null;
let fly: Promise<XTrend[]> | null = null;
/** Trends shared by every panel (fetched once per 5 min). */
export function useTrends() {
  const [t, setT] = useState<XTrend[] | null>(cache && Date.now() - cache.at < 300000 ? cache.list : null);
  const [err, setErr] = useState<Error | null>(null);
  useEffect(() => {
    if (cache && Date.now() - cache.at < 300000) { setT(cache.list); return; }
    fly ||= x<XTrend[]>('trends').then((l) => { cache = { at: Date.now(), list: l }; return l; }).finally(() => { fly = null; });
    fly.then(setT).catch((e) => { setErr(e); setT([]); });
  }, []);
  return { trends: t, err };
}

export function TrendRow({ t, i, label = 'トレンド' }: { t: XTrend; i: number; label?: string }) {
  return (
    <div className="trend-wrap">
      <Link href={`/search?q=${encodeURIComponent(t.query)}`} className="trend sl">
        <span className="muted small">{i + 1} · {label}</span><b>{t.name}</b>{t.volume && <span className="muted small">{fmtNum(t.volume)}件のポスト</span>}
      </Link>
      <TrendWhy name={t.name} query={t.query} />
    </div>
  );
}

/** Scrollable trends list for the right panel. */
export default function TrendsPanel({ max = 20 }: { max?: number }) {
  const { trends } = useTrends();
  return (
    <div className="tp">
      <div className="tp-h"><b>日本のトレンド</b></div>
      <div className="tp-scroll">
        {trends === null && <div className="muted small" style={{ padding: 16 }}>読み込み中…</div>}
        {trends?.length === 0 && <div className="muted small" style={{ padding: 16 }}>トレンドを取得できませんでした</div>}
        {trends?.slice(0, max).map((t, i) => <TrendRow key={t.name} t={t} i={i} />)}
        <Link href="/explore" className="trend sl lnk">さらに表示</Link>
      </div>
    </div>
  );
}
