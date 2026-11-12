import { NextRequest, NextResponse } from 'next/server';
import { client, normTweet, normUser, tweets, users, notifications, trends, errInfo } from '@/lib/x';
import type { XTweet } from '@/lib/types';

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
      case 'home': need(authed); data = tweets(a.tab === 'following' ? await r.user.followed(a.cursor) : await r.user.recommended(a.cursor)); break;
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
      case 'replies': data = tweets(await r.tweet.replies(a.id, a.cursor)); data.list = data.list.filter((t: XTweet) => t.id !== a.id); break;
      case 'user': data = normUser(await r.user.details(String(a.handle).replace(/^@/, ''))); if (!data) throw Object.assign(new Error('not found'), { status: 404 }); break;
      case 'utweets': {
        const f = a.tab === 'replies' ? r.user.replies(a.id, 20, a.cursor) : a.tab === 'media' ? r.user.media(a.id, 20, a.cursor) : a.tab === 'likes' ? (need(authed), r.user.likes(20, a.cursor)) : r.user.timeline(a.id, 20, a.cursor);
        data = tweets(await f); break;
      }
      case 'follows': data = users(a.kind === 'followers' ? await r.user.followers(a.id, 40, a.cursor) : await r.user.following(a.id, 40, a.cursor)); break;
      case 'search': {
        const q = String(a.q || '').trim();
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
