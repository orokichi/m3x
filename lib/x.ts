import 'server-only';
import { Rettiwt, ResourceType, CursoredData, Notification } from 'rettiwt-api';
import type { XTweet, XUser, XMedia, XCard, XNotif, XTrend } from './types';

/** Build a client from per-request credentials (never stored or logged). */
export function client(h: Headers) {
  let apiKey = h.get('x-api-key') || undefined;
  const at = h.get('x-auth-token'), ct0 = h.get('x-ct0');
  if (!apiKey && at && ct0) {
    let twid = (h.get('x-twid') || '').trim();
    const m = twid.match(/(\d{3,})/);
    twid = m ? `twid=u%3D${m[1]};` : '';
    apiKey = Buffer.from(`auth_token=${at.trim()};ct0=${ct0.trim()};${twid}`).toString('base64');
  }
  return { r: new Rettiwt({ apiKey, timeout: 20000, logging: false, maxRetries: 1 }), authed: !!apiKey };
}

const unwrap = (t: any) => (t?.tweet && !t.legacy ? t.tweet : t);
const big = (u?: string) => (u || '').replace('_normal.', '_400x400.');
const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function normUser(raw: any): XUser | undefined {
  raw = raw?.raw ?? raw;
  if (!raw) return;
  const l = raw.legacy || {};
  const url = l.entities?.url?.urls?.[0];
  let bio = l.description || raw.profile_bio?.description || '';
  for (const u of l.entities?.description?.urls || []) bio = bio.replace(u.url, u.expanded_url || u.url);
  return {
    id: raw.rest_id || l.id_str,
    name: raw.core?.name ?? l.name ?? '',
    handle: raw.core?.screen_name ?? l.screen_name ?? '',
    avatar: big(raw.avatar?.image_url || l.profile_image_url_https),
    banner: l.profile_banner_url,
    bio: dec(bio),
    location: raw.location?.location ?? l.location,
    url: url?.expanded_url,
    followers: l.followers_count ?? 0,
    following: l.friends_count ?? 0,
    tweets: l.statuses_count ?? 0,
    likes: l.favourites_count,
    verified: !!(raw.is_blue_verified || l.verified || raw.verification?.verified),
    isFollowing: !!(raw.relationship_perspectives?.following ?? l.following),
    followsYou: !!(raw.relationship_perspectives?.followed_by ?? l.followed_by),
    createdAt: raw.core?.created_at ?? l.created_at,
  };
}

function media(l: any): XMedia[] {
  return (l.extended_entities?.media || l.entities?.media || []).map((m: any): XMedia => {
    const type = m.type === 'animated_gif' ? 'gif' : m.type === 'video' ? 'video' : 'photo';
    const vars = (m.video_info?.variants || []).filter((v: any) => v.content_type === 'video/mp4').sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    const sz = m.original_info || m.sizes?.large || {};
    return { type, url: m.media_url_https, thumb: m.media_url_https, w: sz.width || sz.w, h: sz.height || sz.h, video: vars[0]?.url };
  });
}

function card(raw: any): XCard | undefined {
  const c = raw.card?.legacy;
  if (!c) return;
  const b: Record<string, any> = {};
  for (const v of c.binding_values || []) b[v.key] = v.value;
  const s = (k: string) => b[k]?.string_value;
  const img = b.summary_photo_image_large?.image_value || b.thumbnail_image_large?.image_value || b.photo_image_full_size_large?.image_value || b.summary_photo_image?.image_value;
  const title = s('title');
  if (!title) return;
  return { url: s('card_url') || c.url, title, desc: s('description'), image: img?.url, domain: s('vanity_url') || s('domain') };
}

export function normTweet(t: any): XTweet | undefined {
  let raw = unwrap(t?.raw ?? t);
  if (!raw?.legacy) return;
  const rt = raw.legacy.retweeted_status_result?.result;
  if (rt) {
    const inner = normTweet(rt);
    if (inner) { inner.rtBy = normUser(raw.core?.user_results?.result); return inner; }
  }
  const l = raw.legacy;
  const note = raw.note_tweet?.note_tweet_results?.result;
  let text: string = note?.text || l.full_text || '';
  const ents = note?.entity_set || l.entities || {};
  if (!note && l.display_text_range) {
    const cps = Array.from(text);
    text = cps.slice(l.display_text_range[0], l.display_text_range[1]).join('');
  }
  for (const m of l.entities?.media || []) text = text.replace(m.url, '');
  const q = raw.quoted_status_result?.result;
  const quoted = q ? normTweet(q) : undefined;
  const urls = (ents.urls || l.entities?.urls || []).map((u: any) => ({ url: u.url, expanded: u.expanded_url, display: u.display_url }));
  const cd = card(raw);
  return {
    id: raw.rest_id || l.id_str,
    text: dec(text.trim()),
    createdAt: new Date(l.created_at).toISOString(),
    user: normUser(raw.core?.user_results?.result)!,
    likes: l.favorite_count ?? 0, retweets: l.retweet_count ?? 0, replies: l.reply_count ?? 0, quotes: l.quote_count ?? 0,
    bookmarks: l.bookmark_count ?? 0, views: raw.views?.count ? Number(raw.views.count) : undefined,
    liked: !!l.favorited, retweeted: !!l.retweeted, bookmarked: !!l.bookmarked,
    media: media(l), quoted,
    replyTo: l.in_reply_to_screen_name, replyToId: l.in_reply_to_status_id_str,
    urls, card: cd && !(quoted && cd.url?.includes('/status/')) ? cd : undefined,
  };
}

export const tweets = (d: CursoredData<any>) => ({ list: d.list.map(normTweet).filter(Boolean) as XTweet[], next: d.next || undefined });
export const users = (d: CursoredData<any>) => ({ list: d.list.map(normUser).filter(Boolean) as XUser[], next: d.next || undefined });

export async function notifications(r: Rettiwt, cursor?: string) {
  const res: any = await (r.user as any).request(ResourceType.USER_NOTIFICATIONS, { count: 40, cursor });
  const data = new CursoredData<Notification>(res, 'NOTIFICATION' as any);
  const ids = [...new Set(data.list.flatMap((n) => n.from || []))].slice(0, 80);
  const tids = [...new Set(data.list.flatMap((n) => n.target || []))].slice(0, 80);
  const [us, ts] = await Promise.all([
    ids.length ? r.user.details(ids).catch(() => []) : [],
    tids.length ? r.tweet.details(tids).catch(() => []) : [],
  ]);
  const um = new Map((us as any[]).map((u) => [u.id, normUser(u)]));
  const tm = new Map((ts as any[]).map((t) => [t.id, normTweet(t)]));
  const list: XNotif[] = data.list.map((n) => ({
    id: n.id, message: n.message, type: n.type, at: n.receivedAt ? new Date(n.receivedAt).toISOString() : '',
    users: (n.from || []).map((i) => um.get(i)).filter(Boolean) as XUser[],
    tweet: (n.target || []).map((i) => tm.get(i)).find(Boolean),
  }));
  return { list, next: data.next || undefined };
}

const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
let guest: { t: string; at: number } | undefined;
let trendCache: { at: number; list: XTrend[] } | undefined;
/** Japan trends (WOEID 23424856) via guest token; cached 5 min. */
export async function trends(): Promise<XTrend[]> {
  if (trendCache && Date.now() - trendCache.at < 300_000) return trendCache.list;
  const auth = { authorization: `Bearer ${BEARER}`, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' };
  if (!guest || Date.now() - guest.at > 3_000_000) {
    const g = await fetch('https://api.x.com/1.1/guest/activate.json', { method: 'POST', headers: auth }).then((r) => r.json());
    if (!g.guest_token) throw Object.assign(new Error('guest token'), { status: 503 });
    guest = { t: g.guest_token, at: Date.now() };
  }
  const res = await fetch('https://api.x.com/1.1/trends/place.json?id=23424856', { headers: { ...auth, 'x-guest-token': guest.t } });
  if (!res.ok) { guest = undefined; throw Object.assign(new Error('trends ' + res.status), { status: res.status }); }
  const j = await res.json();
  const list = (j?.[0]?.trends || []).map((t: any) => ({ name: t.name, query: decodeURIComponent(t.query), volume: t.tweet_volume || undefined }));
  trendCache = { at: Date.now(), list };
  return list;
}

export function errInfo(e: any) {
  const status = e?.status ?? e?.response?.status ?? e?.cause?.status;
  const msg = String(e?.message || e);
  if (status === 429 || /rate limit|too many/i.test(msg)) return { code: 'rate', status: 429, msg: 'レート制限中です。しばらく待ってから再試行してください。' };
  if (status === 401 || /authenticat|not authorized|unauthorized|bad.?auth|could not authenticate/i.test(msg))
    return { code: 'auth', status: 401, msg: 'ログインが必要か、Cookie の有効期限が切れています。設定から入力し直してください。' };
  if (status === 403) return { code: 'forbidden', status: 403, msg: 'X に拒否されました（IP ブロック/アカウント制限の可能性）。ローカル実行を試してください。' };
  if (status === 404 || /not found|does not exist/i.test(msg)) return { code: 'notfound', status: 404, msg: '見つかりませんでした。' };
  return { code: 'error', status: 502, msg: 'X との通信に失敗しました: ' + msg.slice(0, 160) };
}

/* ---------- Guest mode (no login) ---------- */
/** Curated popular Japanese accounts for the guest "おすすめ" feed (handle → id). */
export const CURATED: Record<string, string> = {
  YahooNewsTopics: '88846085', livedoornews: '17306975', oricon: '95207674', natalie_mu: '5649672',
  comic_natalie: '18622184', famitsu: '5921162', Nintendo: '307902310', tbs_news: '1203930364558757888',
  ntv_news: '264228304', FNN_News: '21380944', jijicom: '143383314', nikkei: '169480493',
  itmedia_news: '31070671', gizmodojapan: '16181752', weathernews: '15201241', asahi: '42816371',
  pokemon_cojp: '323091128', cinematoday: '18076042',
};
const tlCache = new Map<string, { at: number; v: { list: XTweet[]; next?: string } }>();
async function cachedTimeline(r: Rettiwt, id: string, cursor?: string) {
  const k = id + '|' + (cursor || '');
  const c = tlCache.get(k);
  if (c && Date.now() - c.at < 180_000) return c.v;
  const v = tweets(await r.user.timeline(id, 20, cursor));
  tlCache.set(k, { at: Date.now(), v });
  if (tlCache.size > 500) tlCache.delete(tlCache.keys().next().value!);
  return v;
}
const enc = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
const decC = (s?: string) => { try { return s ? JSON.parse(Buffer.from(s, 'base64url').toString()) : undefined; } catch { return undefined; } };

/** Merge recent posts of several accounts, newest first. Cursor = per-account cursors. */
export async function mergedFeed(r: Rettiwt, ids: string[], cursor?: string, opts: { maxAgeDays?: number; noReplies?: boolean } = {}) {
  const cur: Record<string, string> | undefined = decC(cursor);
  const targets = cur ? Object.keys(cur) : [...new Set(ids)].slice(0, 40);
  const res = await Promise.all(targets.map((id) => cachedTimeline(r, id, cur?.[id]).then((v) => [id, v] as const).catch(() => [id, undefined] as const)));
  if (!res.some(([, v]) => v)) throw Object.assign(new Error('guest timeline unavailable'), { status: 503 });
  const cutoff = Date.now() - (opts.maxAgeDays ?? 30) * 86400_000;
  const seen = new Set<string>();
  const list: XTweet[] = [];
  const next: Record<string, string> = {};
  for (const [id, v] of res) {
    if (!v) continue;
    let fresh = 0;
    for (const t of v.list) {
      if (!t?.user || seen.has(t.id)) continue;
      if (new Date(t.createdAt).getTime() < cutoff) continue;
      if (opts.noReplies && t.replyTo && t.replyTo.toLowerCase() !== t.user.handle.toLowerCase()) continue;
      seen.add(t.id); list.push(t); fresh++;
    }
    if (v.next && v.next !== cur?.[id] && fresh > 0) next[id] = v.next;
  }
  list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return { list, next: Object.keys(next).length ? enc(next) : undefined };
}

const userCache = new Map<string, { at: number; u: XUser }>();
export async function guestUser(r: Rettiwt, handle: string) {
  const k = handle.toLowerCase();
  const c = userCache.get(k);
  if (c && Date.now() - c.at < 3_600_000) return c.u;
  const u = normUser(await r.user.details(handle));
  if (u) userCache.set(k, { at: Date.now(), u });
  return u;
}
export async function curatedUsers(r: Rettiwt) {
  const us = await Promise.all(Object.keys(CURATED).map((h) => guestUser(r, h).catch(() => undefined)));
  return us.filter(Boolean) as XUser[];
}
