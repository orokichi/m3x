'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useGroq } from '@/lib/ai';

/** Unified search box. Enter = normal search; sparkle = AI search (only when a Groq key is set). */
export function SearchBar({ q = '', tab = 'top', autoFocus }: { q?: string; tab?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const groq = useGroq();
  const [v, setV] = useState(q);
  useEffect(() => setV(q), [q]);
  const go = (f: string) => { const t = v.trim(); if (t) router.push(`/search?q=${encodeURIComponent(t)}&f=${f}`); };
  return (
    <form className="sbox wide" onSubmit={(e) => { e.preventDefault(); go(tab === 'ai' ? 'top' : tab); }}>
      <Icon n="search" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="検索" autoFocus={autoFocus} enterKeyHint="search" data-action="search" data-label="検索ボックス" />
      {groq && <button type="button" className={'sb-ai' + (tab === 'ai' ? ' on' : '')} onClick={() => go('ai')} disabled={!v.trim()} aria-label="AI で検索" title="AI で検索" data-action="ai-search" data-label="AI で検索"><Icon n="auto_awesome" s={20} fill /></button>}
    </form>
  );
}
