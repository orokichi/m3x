'use client';
import { useCallback, useRef, useState } from 'react';
import { groq } from './ai';
import { makeCache, type Job, type LitePost } from './aiPrompts';
import type { XTweet } from './types';

/* Client runner for aiPrompts jobs: cached per post/content in memory + sessionStorage to save tokens. */
const cache = makeCache(typeof window !== 'undefined' ? window.sessionStorage : null);
export const cachedAi = (key: string) => cache.get(key);
export const runJob = (job: Job, force = false) => cache.run(job, (j) => groq(j.messages, { tier: j.tier, max: j.max, json: j.json, temperature: j.temperature }), force);

export const lite = (t: XTweet): LitePost & { quoted?: LitePost } => ({
  id: t.id, handle: t.user.handle, name: t.user.name, text: t.text, at: t.createdAt ? new Date(t.createdAt).toISOString() : undefined, likes: t.likes, media: t.media.length,
  quoted: t.quoted ? { id: t.quoted.id, handle: t.quoted.user.handle, text: t.quoted.text } : undefined,
});

/** One AI request with loading / error / cached-result state. */
export function useAi() {
  const [st, setSt] = useState<{ busy?: boolean; out?: string; err?: string; key?: string }>({});
  const seq = useRef(0);
  const run = useCallback(async (job: Job, force = false) => {
    const n = ++seq.current;
    const hit = force ? undefined : cache.get(job.key);
    if (hit !== undefined) { setSt({ out: hit, key: job.key }); return hit; }
    setSt({ busy: true, key: job.key });
    try { const out = await runJob(job, force); if (n === seq.current) setSt({ out, key: job.key }); return out; }
    catch (e: any) { if (n === seq.current) setSt({ err: e?.message || 'エラーが発生しました', key: job.key }); return undefined; }
  }, []);
  const reset = useCallback(() => { seq.current++; setSt({}); }, []);
  return { ...st, run, reset };
}
