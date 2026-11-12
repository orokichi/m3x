import { NextRequest, NextResponse } from 'next/server';
import { client, normTweet, normUser, tweets, users, notifications, trends, errInfo, CURATED, mergedFeed, guestUser, curatedUsers } from '@/lib/x';
import type { XTweet, XUser } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const need = (authed: boolean) => { if (!authed) throw Object.assign(new Error('Not authorized'), { status: 401 }); };

export async function POST(req: NextRequest) {
  const { op, ...a } = await req.json().catch(() => ({}));
  const { r, authed } = client(req.headers);
  try {
    let data: any;
    switch (op) {
      case 'me': need(authed); data = normUser(await r.user.details()); break;
      case 'home': {
        if (authed) { data = tweets(a.tab === 'following' ? await r.user.followed(a.cursor) : await r.user.recommended(a.cursor)); break; }
        const ids: string[] = (Array.isArray(a.ids) ? a.ids : []).map(String).filter((i: string) => /^\d+$/.test(i));
        if (a.tab === 'following') { data = ids.length ? await mergedFeed(r, ids, a.cursor, { maxAgeDays: 60 }) : { list: [] }; break; }
        data = await mergedFeed(r, [...Object.values(CURATED), ...ids], a.cursor, { maxAgeDays: 7, noReplies: true }); break;
      }
      case 'gusers': data = { list: await curatedUsers(r) }; break;
      case 'tweet': {
        const t = normTweet(await r.tweet.details(a.id));
        if (!t) throw Object.assign(new Error('not found'), { status: 404 });
        const parents: XTweet[] = [];
        let pid = t.replyToId;
        for (let i = 0; pid && i < 3; i++) {
          const p = normTweet(await r.tweet.details(pid).catch(() => undefined));
          if (!p) break; parents.unshift(p); pid = p.replyToId;
        }
        data = { tweet: t, parents };
        break;
      }
      case 'replies': if (!authed) { data = { list: [] }; break; } data = tweets(await r.tweet.replies(a.id, a.cursor)); data.list = data.list.filter((t: XTweet) => t.id !== a.id); break;
      case 'user': data = authed ? normUser(await r.user.details(String(a.handle).replace(/^@/, ''))) : await guestUser(r, String(a.handle).replace(/^@/, '')); if (!data) throw Object.assign(new Error('not found'), { status: 404 }); break;
      case 'utweets': {
        const f = a.tab === 'replies' ? r.user.replies(a.id, 20, a.cursor) : a.tab === 'media' ? r.user.media(a.id, 20, a.cursor) : a.tab === 'likes' ? (need(authed), r.user.likes(20, a.cursor)) : r.user.timeline(a.id, 20, a.cursor);
        data = tweets(await f); break;
      }
      case 'follows': data = users(a.kind === 'followers' ? await r.user.followers(a.id, 40, a.cursor) : await r.user.following(a.id, 40, a.cursor)); break;
      case 'search': {
        const q = String(a.q || '').trim();
        if (!authed) { data = await guestSearch(r, q, a.tab, a.ids); break; }
        if (a.tab === 'people') { data = users(await r.user.search(q, 20, a.cursor)); break; }
        const words = a.tab === 'media' ? [q, 'filter:media'] : [q];
        data = tweets(await r.tweet.search({ includeWords: words, top: a.tab !== 'latest' }, 20, a.cursor)); break;
      }
      case 'bookmarks': need(authed); data = tweets(await r.user.bookmarks(20, a.cursor)); break;
      case 'notifications': need(authed); data = await notifications(r, a.cursor); break;
      case 'trends': data = await trends(); break;
      case 'lists': need(authed); data = { list: (await r.user.lists(40, a.cursor)).list.map((l: any) => ({ id: l.id, name: l.name, desc: l.description, members: l.memberCount })) }; break;
      case 'list': data = tweets(await r.list.tweets(a.id, 20, a.cursor)); break;
      case 'suggest': need(authed); data = users(await r.user.suggestions()); data.list = data.list.slice(0, 3); break;
      case 'like': need(authed); data = a.on ? await r.tweet.like(a.id) : await r.tweet.unlike(a.id); break;
      case 'retweet': need(authed); data = a.on ? await r.tweet.retweet(a.id) : await r.tweet.unretweet(a.id); break;
      case 'bookmark': need(authed); data = a.on ? await r.tweet.bookmark(a.id) : await r.tweet.unbookmark(a.id); break;
      case 'follow': need(authed); data = a.on ? await r.user.follow(a.id) : await r.user.unfollow(a.id); break;
      case 'delete': need(authed); data = await r.tweet.unpost(a.id); break;
      case 'post': {
        need(authed);
        const ids: string[] = [];
        for (const img of (a.images || []).slice(0, 4)) {
          const buf = Buffer.from(String(img).split(',').pop()!, 'base64');
          ids.push(await r.tweet.upload(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer));
        }
        data = await r.tweet.post({ text: a.text || '', replyTo: a.replyTo, quote: a.quote, media: ids.length ? ids.map((id) => ({ id })) : undefined });
        break;
      }
      default: return NextResponse.json({ error: { code: 'bad', msg: 'unknown op' } }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch (e: any) {
    const info = errInfo(e);
    return NextResponse.json({ error: info }, { status: info.status });
  }
}

/** No-login search: X's search API needs a login, so look up the handle directly and
 *  search the recent posts of curated + locally followed accounts. */
async function guestSearch(r: any, q: string, tab: string, ids?: string[]) {
  const ql = q.toLowerCase().replace(/^[@＠]/, '');
  if (tab === 'people') {
    const out: XUser[] = [];
    if (/^\w{1,15}$/.test(ql)) { const u = await guestUser(r, ql).catch(() => undefined); if (u) out.push(u); }
    for (const u of await curatedUsers(r)) if (!out.some((o) => o.id === u.id) && (u.name.toLowerCase().includes(ql) || u.handle.toLowerCase().includes(ql) || (u.bio || '').toLowerCase().includes(ql))) out.push(u);
    return { list: out };
  }
  const pool = await mergedFeed(r, [...Object.values(CURATED), ...(Array.isArray(ids) ? ids.map(String) : [])], undefined, { maxAgeDays: 30 });
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = pool.list.filter((t) => { const s = (t.text + ' ' + t.user.name + ' ' + t.user.handle).toLowerCase(); return terms.every((w) => s.includes(w.replace(/^[#＃]/, '#')) || s.includes(w.replace(/^[#＃]/, ''))); });
  if (tab === 'media') list = list.filter((t) => t.media.length);
  if (tab === 'top') list.sort((a, b) => b.likes + b.retweets - (a.likes + a.retweets));
  return { list };
}
