import { NextRequest } from 'next/server';
export const runtime = 'edge';
const OK = /^https:\/\/(pbs|abs|ton)\.twimg\.com\//;
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || '';
  if (!OK.test(u)) return new Response('bad url', { status: 400 });
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'image/avif,image/webp,image/*' } });
  if (!r.ok) return new Response('upstream ' + r.status, { status: r.status });
  return new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=86400, s-maxage=604800, immutable' } });
}
