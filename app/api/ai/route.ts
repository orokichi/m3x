import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Fallback chains in case Groq retires a model. */
const MODELS: Record<string, string[]> = {
  small: ['llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'],
  large: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
};

/** Thin proxy to Groq with the user's own key (from header). The key is never stored or logged. */
export async function POST(req: NextRequest) {
  const key = (req.headers.get('x-groq-key') || '').trim();
  if (!key) return Response.json({ error: 'Groq の API キーが設定されていません' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const chain = MODELS[b.tier] || MODELS.small;
  let budget = 24000;
  const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-12).map((m: any) => {
    const c = String(m?.content || '').slice(0, Math.max(0, budget)); budget -= c.length;
    return { role: ['system', 'user', 'assistant'].includes(m?.role) ? m.role : 'user', content: c };
  });
  const max = Math.min(Math.max(Number(b.max_tokens) || 300, 1), 1024);
  let last = '';
  for (const model of chain) {
    const oss = model.startsWith('openai/');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model, messages, temperature: Math.min(Math.max(Number(b.temperature) || 0.3, 0), 1),
        max_tokens: oss ? max + 400 : max, ...(oss ? { reasoning_effort: 'low' } : {}),
        ...(b.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    }).catch(() => null);
    if (!r) { last = 'Groq に接続できませんでした'; continue; }
    const j: any = await r.json().catch(() => ({}));
    if (r.ok) return Response.json({ text: j.choices?.[0]?.message?.content || '', model }, { headers: { 'Cache-Control': 'no-store' } });
    const msg = String(j?.error?.message || `HTTP ${r.status}`);
    if (r.status === 401) return Response.json({ error: 'Groq の API キーが無効です（設定を確認してください）' }, { status: 401 });
    if (r.status === 429) return Response.json({ error: 'Groq のレート制限に達しました。少し待ってから再試行してください' }, { status: 429 });
    last = msg;
    if (r.status === 404 || /model|decommission/i.test(msg)) continue; // try next model
    return Response.json({ error: `AIエラー: ${msg.slice(0, 200)}` }, { status: r.status });
  }
  return Response.json({ error: `AIエラー: ${last.slice(0, 200)}` }, { status: 502 });
}
