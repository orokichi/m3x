'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { x, fmtNum } from '@/lib/api';
import { useGroq } from '@/lib/ai';
import { ErrorBox, Icon, Spinner } from '@/components/ui';
import { SearchBar } from '@/components/SearchBar';
import type { XTrend } from '@/lib/types';

const EXAMPLES = ['最近1週間で話題になった生成AIのニュース', '@Nintendo の新作発表で画像つきのポスト', '天気・地震に関する速報'];

export default function Explore() {
  const groq = useGroq();
  const [t, setT] = useState<XTrend[] | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  useEffect(() => { x<XTrend[]>('trends').then(setT).catch(setErr); }, []);
  return (
    <>
      <header className="colhead sticky"><SearchBar autoFocus /></header>
      {groq && <div className="ex-ai">
        <span className="ss-kicker"><Icon n="auto_awesome" s={15} fill />AI 検索</span>
        <p className="muted small">入力して <Icon n="auto_awesome" s={14} fill /> を押すと、AI が条件を考えて探し、要約と関連度順の結果を返します。</p>
        <div className="chips">{EXAMPLES.map((e) => <Link key={e} className="chip" href={`/search?q=${encodeURIComponent(e)}&f=ai`}>{e}</Link>)}</div>
      </div>}
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
