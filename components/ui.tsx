'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { x, ApiError, fmtNum, fmtTime, toast, getCreds, isLocalFollow, setLocalFollow, img } from '@/lib/api';
import type { XTweet, XUser, XMedia, Page } from '@/lib/types';
import { MIME, MIME_MEDIA, snap, kmedia, pickMemo, useMemoOn, addCtx, registerSrc, useMemo2, memo, KEEP } from '@/lib/memo';
import { useGroq } from '@/lib/ai';
import AgentIcon from './AgentIcon';
import { Img, LazyVideo } from './Media';

const Lightbox = dynamic(() => import('./Lightbox'), { ssr: false });

export const Icon = ({ n, fill, s }: { n: string; fill?: boolean; s?: number }) => <span className={'ms' + (fill ? ' fill' : '')} style={s ? { fontSize: s } : undefined}>{n}</span>;
/** M3 Expressive loading indicator (morphing shape). */
export const Loader = ({ s = 38, c }: { s?: number; c?: boolean }) => <span className={'m3-load' + (c ? ' contained' : '')} style={{ width: s, height: s }} role="progressbar" aria-label="読み込み中"><i /></span>;
export const Spinner = () => <div className="spin-wrap"><Loader /></div>;
export const Verified = () => <span className="ms fill verified" title="認証済み">verified</span>;

export function Avatar({ u, size = 40 }: { u?: XUser; size?: number }) {
  return u?.avatar ? <img className="av" src={img(u.avatar)} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" referrerPolicy="no-referrer" />
    : <div className="av ph" style={{ width: size, height: size }}>{u?.name?.[0] || '?'}</div>;
}

export function ErrorBox({ e, retry }: { e: ApiError | Error; retry?: () => void }) {
  const code = (e as ApiError).code;
  return (
    <div className="empty">
      <Icon n={code === 'auth' ? 'key' : code === 'rate' ? 'hourglass_top' : 'cloud_off'} s={48} />
      <p>{e.message}</p>
      <div className="row-flex" style={{ justifyContent: 'center' }}>
        {code === 'auth' && <Link className="btn filled" href="/settings">ログイン設定へ</Link>}
        {retry && <button className="btn tonal" onClick={retry}>再試行</button>}
      </div>
    </div>
  );
}

/** Inline text with links, @mentions and #hashtags. */
export function RichText({ t }: { t: Pick<XTweet, 'text' | 'urls'> }) {
  const map = new Map(t.urls.map((u) => [u.url, u]));
  const parts = t.text.split(/(https?:\/\/t\.co\/\w+|@\w{1,15}|[#＃][^\s!-/:-@[-^`{-~　、。！？「」]+)/g);
  return (
    <>{parts.map((p, i) => {
      if (!p) return null;
      if (p.startsWith('http')) { const u = map.get(p); return <a key={i} className="lnk" href={u?.expanded || p} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{u?.display || p}</a>; }
      if (p[0] === '@' && /^@\w+$/.test(p)) return <Link key={i} className="lnk" href={`/u/${p.slice(1)}`} onClick={(e) => e.stopPropagation()}>{p}</Link>;
      if (p[0] === '#' || p[0] === '＃') return <Link key={i} className="lnk" href={`/search?q=${encodeURIComponent('#' + p.slice(1))}`} onClick={(e) => e.stopPropagation()}>{p}</Link>;
      return <span key={i}>{p}</span>;
    })}</>
  );
}

export function MediaGrid({ media, t }: { media: XMedia[]; t?: XTweet }) {
  const [view, setView] = useState<number | null>(null);
  const memoOn = useMemoOn();
  if (!media.length) return null;
  const one = media.length === 1 ? media[0] : null;
  const dragOn = memoOn && !!t;
  /** Drag a single image/video/GIF (separate from dragging the whole post). */
  const drag = (m: XMedia) => (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData(MIME_MEDIA, JSON.stringify({ src: snap(t!), media: kmedia(m) }));
    e.dataTransfer.setData(MIME, JSON.stringify(snap(t!)));
    e.dataTransfer.setData('text/uri-list', m.type === 'photo' ? m.url : `https://x.com/${t!.user.handle}/status/${t!.id}`);
    e.dataTransfer.effectAllowed = 'copy';
  };
  const ms = media.slice(0, 4);
  const r = (m: XMedia) => (m.w && m.h ? m.w / m.h : m.type === 'photo' ? 4 / 3 : 16 / 9);
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  // Frame from the original aspect ratio: single = exact (clamped 4:5..2:1, width shrinks for tall ones so height stays bounded);
  // two = side by side with columns proportional to each ratio; three/four = 16:9 grid.
  const frame: React.CSSProperties = one ? ({ '--r': clamp(r(one), 0.8, 2) } as any)
    : ms.length === 2 ? { aspectRatio: String(clamp(r(ms[0]) + r(ms[1]), 1, 2.4)), gridTemplateColumns: `minmax(0,${clamp(r(ms[0]), 0.5, 2)}fr) minmax(0,${clamp(r(ms[1]), 0.5, 2)}fr)` }
    : {};
  const fit = (m: XMedia) => (one && Math.abs(r(m) - clamp(r(m), 0.8, 2)) < 0.01 ? 'contain' : 'cover');
  return (
    <>
      <div className={`mgrid n${ms.length}`} style={frame} onClick={(e) => e.stopPropagation()}>
        {ms.map((m, i) => m.type === 'photo'
          ? <button key={i} className="mcell" onClick={() => setView(i)} draggable={dragOn || undefined} onDragStart={dragOn ? drag(m) : undefined} aria-label="画像を表示">
              <Img src={m.url} color={m.c} fit={fit(m)} />
            </button>
          : <div key={i} className="mcell" draggable={dragOn || undefined} onDragStart={dragOn ? drag(m) : undefined}>
              <LazyVideo m={m} fit={fit(m)} />
              {m.type === 'gif' && <span className="gif">GIF</span>}
            </div>)}
      </div>
      {view != null && <Lightbox urls={media.filter((m) => m.type === 'photo').map((m) => m.url)} start={media.filter((m) => m.type === 'photo').indexOf(media[view])} onClose={() => setView(null)} />}
    </>
  );
}

function Quote({ t }: { t: XTweet }) {
  const router = useRouter();
  return (
    <div className="quote sl" onClick={(e) => { e.stopPropagation(); router.push(`/status/${t.id}`); }}>
      <div className="qhead"><Avatar u={t.user} size={20} /><b>{t.user.name}</b>{t.user.verified && <Verified />}<span className="muted">@{t.user.handle} · {fmtTime(t.createdAt)}</span></div>
      {t.text && <div className="qtext"><RichText t={t} /></div>}
      <MediaGrid media={t.media} t={t} />
    </div>
  );
}

function Card({ c }: { c: NonNullable<XTweet['card']> }) {
  return (
    <a className="lcard sl" href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {c.image && <span className="lc-img"><Img src={c.image} /></span>}
      <div className="lc-t"><span className="muted small">{c.domain}</span><b>{c.title}</b>{c.desc && <span className="muted small clamp2">{c.desc}</span>}</div>
    </a>
  );
}

const authed = () => { if (!getCreds()) { toast('ゲストモードでは使えません（設定からログインできます）'); return false; } return true; };

export function Actions({ t, big }: { t: XTweet; big?: boolean }) {
  const [s, setS] = useState({ liked: t.liked, likes: t.likes, rt: t.retweeted, rts: t.retweets, bm: t.bookmarked });
  const [menu, setMenu] = useState(false);
  const [smenu, setSmenu] = useState(false);
  const memoOn = useMemoOn();
  const groqOn = useGroq();
  const more = memoOn || groqOn;
  const st = useMemo2();
  const kept = !!st.folders[0]?.items?.some((i) => !i.media && i.src.id === t.id);
  const bmOn = kept || s.bm;
  /** Bookmark = save to the local Keep folder (works in guest mode); also bookmarks on X when logged in. */
  const keep = async () => {
    const on = !bmOn;
    if (on) memo.addItem({ src: snap(t) }, KEEP, true); else memo.unkeep(t.id);
    toast(on ? 'Keep に保存しました' : 'Keep から削除しました');
    if (!getCreds() || on === s.bm) return;
    const prev = s; setS({ ...s, bm: on });
    try { await x('bookmark', { id: t.id, on }); } catch (e: any) { setS(prev); toast(e.message); }
  };
  const toggle = async (op: 'like' | 'retweet') => {
    if (!authed()) return;
    const prev = s;
    const on = op === 'like' ? !s.liked : !s.rt;
    setS(op === 'like' ? { ...s, liked: on, likes: s.likes + (on ? 1 : -1) } : { ...s, rt: on, rts: s.rts + (on ? 1 : -1) });
    try { await x(op, { id: t.id, on }); }
    catch (e: any) { setS(prev); toast(e.message); }
  };
  const share = async () => {
    const url = `https://x.com/${t.user.handle}/status/${t.id}`;
    if (navigator.share) navigator.share({ url }).catch(() => {}); else { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); }
  };
  const stop = (f: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); f(); };
  return (
    <div className={'actions' + (big ? ' big' : '')}>
      <button className="act sl c-blue" data-ax={`reply:${t.id}`} data-ax-label={`返信（@${t.user.handle}のポスト）`} onClick={stop(() => authed() && window.dispatchEvent(new CustomEvent('m3x-compose', { detail: { replyTo: t } })))} aria-label="返信"><Icon n="chat_bubble" /><span>{fmtNum(t.replies) || ''}</span></button>
      <div className="act-wrap">
        <button className={'act sl c-green' + (s.rt ? ' on' : '')} data-ax={`repost-menu:${t.id}`} data-ax-label={`リポスト／引用メニュー（@${t.user.handle}）`} onClick={stop(() => setMenu(!menu))} aria-label="リポスト"><Icon n="repeat" /><span>{fmtNum(s.rts) || ''}</span></button>
        {menu && <div className="menu" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setMenu(false)}>
          <button data-ax={`repost:${t.id}`} data-ax-risk="1" data-ax-label={s.rt ? 'リポストを取り消す' : `リポスト（@${t.user.handle}のポスト）`} onClick={() => { setMenu(false); toggle('retweet'); }}><Icon n="repeat" />{s.rt ? 'リポストを取り消す' : 'リポスト'}</button>
          <button data-ax={`quote:${t.id}`} data-ax-label={`引用（@${t.user.handle}のポスト）`} onClick={() => { setMenu(false); authed() && window.dispatchEvent(new CustomEvent('m3x-compose', { detail: { quote: t } })); }}><Icon n="edit_square" />引用</button>
        </div>}
      </div>
      <button className={'act sl c-pink' + (s.liked ? ' on' : '')} data-ax={`like:${t.id}`} data-ax-risk="1" data-ax-label={`${s.liked ? 'いいねを取り消す' : 'いいね'}（@${t.user.handle}のポスト）`} onClick={stop(() => toggle('like'))} aria-label="いいね"><Icon n="favorite" fill={s.liked} /><span>{fmtNum(s.likes) || ''}</span></button>
      {!big && <span className="act views"><Icon n="bar_chart" /><span>{fmtNum(t.views) || ''}</span></span>}
      <div className="act-r">
        <button className={'act sl c-blue' + (bmOn ? ' on' : '')} data-ax={`bookmark:${t.id}`} data-ax-risk="1" data-ax-label={`${bmOn ? 'ブックマーク解除' : 'ブックマーク（Keep に保存）'}（@${t.user.handle}のポスト）`} onClick={stop(keep)} aria-label={bmOn ? 'Keep から削除' : 'Keep に保存'} aria-pressed={bmOn}><Icon n="bookmark" fill={bmOn} /></button>
        <div className="act-wrap">
          <button className="act sl c-blue" onClick={stop(() => (more ? setSmenu(!smenu) : share()))} aria-label="共有" aria-haspopup={more ? 'menu' : undefined}><Icon n="ios_share" /></button>
          {smenu && <div className="menu r" role="menu" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setSmenu(false)}>
            <button role="menuitem" onClick={() => { setSmenu(false); share(); }}><Icon n="ios_share" />共有・リンクをコピー</button>
            <button role="menuitem" onClick={() => { setSmenu(false); pickMemo(snap(t)); }}><Icon n="bookmarks" />Keep・フォルダに追加</button>
            {groqOn && <button role="menuitem" onClick={() => { setSmenu(false); if (addCtx(snap(t))) window.dispatchEvent(new Event('m3x-open-agent')); }}><AgentIcon size={20} />Agent に追加</button>}
          </div>}
        </div>
      </div>
    </div>
  );
}

export function TweetCard({ t, thread }: { t: XTweet; thread?: boolean }) {
  const router = useRouter();
  const go = () => { if (!window.getSelection()?.toString()) router.push(`/status/${t.id}`); };
  const memoOn = useMemoOn();
  /* Register the post's Src so Agent Actions can save it / add it to context. */
  useEffect(() => { registerSrc(snap(t)); }, [t]);
  const drag = (e: React.DragEvent) => {
    e.dataTransfer.setData(MIME, JSON.stringify(snap(t)));
    e.dataTransfer.setData('text/uri-list', `https://x.com/${t.user.handle}/status/${t.id}`);
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <article className={'tweet' + (thread ? ' thread' : '') + (memoOn ? ' dragga' : '')} onClick={go} draggable={memoOn || undefined} onDragStart={memoOn ? drag : undefined}
      data-ax-post={t.id} data-ax-text={`@${t.user.handle}: ${t.text.replace(/https?:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)}`}>
      {t.rtBy && <div className="rt-by"><Icon n="repeat" s={16} /><Link href={`/u/${t.rtBy.handle}`} onClick={(e) => e.stopPropagation()}>{t.rtBy.name}さんがリポスト</Link></div>}
      <div className="tw-body">
        <div className="tw-left"><Link href={`/u/${t.user.handle}`} onClick={(e) => e.stopPropagation()}><Avatar u={t.user} /></Link>{thread && <i className="tline" />}</div>
        <div className="tw-main">
          <div className="tw-head">
            <Link href={`/u/${t.user.handle}`} className="nm" onClick={(e) => e.stopPropagation()}>{t.user.name}</Link>
            {t.user.verified && <Verified />}
            <span className="muted ell">@{t.user.handle}</span><span className="muted">·</span>
            <time className="muted" title={new Date(t.createdAt).toLocaleString('ja-JP')}>{fmtTime(t.createdAt)}</time>
          </div>
          {t.replyTo && !thread && <div className="muted small">返信先: <Link className="lnk" href={`/u/${t.replyTo}`} onClick={(e) => e.stopPropagation()}>@{t.replyTo}</Link></div>}
          {t.text && <div className="tw-text"><RichText t={t} /></div>}
          <MediaGrid media={t.media} t={t} />
          {t.card && !t.media.length && <Card c={t.card} />}
          {t.quoted && <Quote t={t.quoted} />}
          <Actions t={t} />
        </div>
      </div>
    </article>
  );
}

export function UserRow({ u, onClick }: { u: XUser; onClick?: () => void }) {
  return (
    <Link href={`/u/${u.handle}`} className="urow sl" onClick={onClick} data-ax={`user:${u.handle}`} data-ax-label={`@${u.handle} のプロフィール`}>
      <Avatar u={u} />
      <div className="ur-t">
        <div className="row-flex" style={{ gap: 4 }}><b className="ell">{u.name}</b>{u.verified && <Verified />}</div>
        <div className="muted ell">@{u.handle}{u.followsYou && <span className="tag">フォローされています</span>}</div>
        {u.bio && <div className="clamp2 small">{u.bio}</div>}
      </div>
      <FollowBtn u={u} />
    </Link>
  );
}

export function FollowBtn({ u, lg }: { u: XUser; lg?: boolean }) {
  const [on, setOn] = useState(!!u.isFollowing);
  const [hover, setHover] = useState(false);
  const guest = useRef(true);
  useEffect(() => { guest.current = !getCreds(); if (guest.current) setOn(isLocalFollow(u.id)); }, [u.id]);
  const click = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (guest.current) { const n = !on; setOn(n); setLocalFollow(u, n); toast(n ? `@${u.handle} をフォローしました（この端末に保存）` : `@${u.handle} のフォローを解除しました`); return; }
    const n = !on; setOn(n);
    try { await x('follow', { id: u.id, on: n }); } catch (er: any) { setOn(!n); toast(er.message); }
  };
  return <button className={'btn ' + (on ? 'outlined' : 'inverse') + (lg ? '' : ' sm') + (on && hover ? ' danger' : '')} data-ax={`follow:${u.handle}`} data-ax-risk="1" data-ax-label={`${on ? 'フォロー解除' : 'フォロー'}（@${u.handle}）`} onClick={click} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
    {on ? (hover ? 'フォロー解除' : 'フォロー中') : 'フォロー'}</button>;
}

/* ---------- feed state snapshot (scroll restoration) ----------
   App Router unmounts page components on navigation, so a feed loses its
   items + scroll position and the browser's own scroll restoration lands
   on an (initially) empty page. We snapshot each feed (keyed by op+args)
   in sessionStorage and, only for back/forward (popstate) returns, seed
   the items synchronously-ish and restore the scroll offset once painted. */
let lastPopAt = 0;
if (typeof window !== 'undefined') window.addEventListener('popstate', () => { lastPopAt = Date.now(); });

interface FeedSnap<T> { items: T[]; next?: string; done: boolean; scrollY: number; ts: number }
function feedKey(op: string, ak: string) {
  let h = 0; const s = op + '|' + ak;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'm3x.feed.' + (h >>> 0).toString(36);
}
function readSnap<T>(k: string): FeedSnap<T> | null {
  try { const v = sessionStorage.getItem(k); if (!v) return null; const s = JSON.parse(v); return s && Array.isArray(s.items) ? s as FeedSnap<T> : null; } catch { return null; }
}
function writeSnap<T>(k: string, s: FeedSnap<T>) {
  try { sessionStorage.setItem(k, JSON.stringify(s)); } catch { try { sessionStorage.removeItem(k); } catch { /* ignore */ } }
}
function patchSnapScroll(k: string, y: number) {
  try { const v = sessionStorage.getItem(k); if (!v) return; const s = JSON.parse(v); if (s && Array.isArray(s.items)) { s.scrollY = y; sessionStorage.setItem(k, JSON.stringify(s)); } } catch { /* ignore */ }
}

/** Infinite-scroll feed of any cursored op. */
export function Feed<T>({ op, args, render, empty, keyOf }: { op: string; args?: Record<string, any>; render: (item: T) => React.ReactNode; empty?: string; keyOf: (t: T) => string }) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const ak = JSON.stringify(args || {});
  const fkey = feedKey(op, ak);
  const firstRun = useRef(true);
  const pendingScroll = useRef<number | null>(null);
  const scrollYRef = useRef(0);

  const load = useCallback(async (cursor?: string, reset?: boolean) => {
    if (busy.current) return; busy.current = true; setLoading(true); setErr(null);
    try {
      const p = await x<Page<T>>(op, { ...(args || {}), cursor });
      setItems((prev) => {
        const base = reset ? [] : prev; const seen = new Set(base.map(keyOf));
        return [...base, ...p.list.filter((i) => !seen.has(keyOf(i)))];
      });
      setNext(p.next); setDone(!p.next || !p.list.length || p.next === cursor);
    } catch (e: any) { setErr(e); }
    finally { busy.current = false; setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op, ak]);

  /* First mount: restore the snapshot instead of refetching when returning
     via back/forward, or when it is still fresh (< 3 min) on a fresh visit. */
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      const s = readSnap<T>(fkey);
      const back = Date.now() - lastPopAt < 2000;
      if (s && s.items.length && (back || Date.now() - s.ts < 3 * 60 * 1000)) {
        setItems(s.items); setNext(s.next); setDone(s.done);
        scrollYRef.current = s.scrollY;
        if (back) pendingScroll.current = s.scrollY;
        return;
      }
    }
    setItems([]); setNext(undefined); setDone(false); load(undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  /* Persist items/cursor as they change (scroll offset is patched separately). */
  useEffect(() => {
    if (items.length) writeSnap(fkey, { items: items.slice(0, 60), next, done, scrollY: scrollYRef.current, ts: Date.now() });
  }, [items, next, done, fkey]);

  /* Track the scroll offset for this feed and keep the snapshot in sync. */
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      scrollYRef.current = window.scrollY;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; patchSnapScroll(fkey, scrollYRef.current); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); patchSnapScroll(fkey, window.scrollY); };
  }, [fkey]);

  /* Apply the pending scroll restore once the seeded items have painted. */
  useEffect(() => {
    if (pendingScroll.current == null || !items.length) return;
    const y = pendingScroll.current; pendingScroll.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [items]);

  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && next && !done && !busy.current && !err) load(next); }, { rootMargin: '1200px' });
    io.observe(el); return () => io.disconnect();
  }, [next, done, err, load]);

  return (
    <div>
      {items.map((i) => <div key={keyOf(i)}>{render(i)}</div>)}
      {err && <ErrorBox e={err} retry={() => load(items.length ? next : undefined, !items.length)} />}
      {loading && <Spinner />}
      {!loading && !err && done && !items.length && <div className="empty"><Icon n="inbox" s={48} /><p>{empty || 'まだ何もありません'}</p></div>}
      <div ref={sentinel} style={{ height: 1 }} />
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => <button key={k} role="tab" className={'tab sl' + (value === k ? ' on' : '')} onClick={() => onChange(k)} data-ax={`tab:${k}`} data-ax-label={`タブ「${label}」`}><span>{label}</span></button>)}
    </div>
  );
}

export function Header({ title, sub, back = true, children }: { title?: React.ReactNode; sub?: React.ReactNode; back?: boolean; children?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="colhead">
      <div className="ch-row">
        {back && <button className="icon-btn sl" data-ax="back" data-ax-label="戻る" onClick={() => (history.length > 1 ? router.back() : router.push('/'))} aria-label="戻る"><Icon n="arrow_back" /></button>}
        <div className="ch-t">{title && (typeof title === 'string' ? <h1>{title}</h1> : title)}{sub && <div className="muted small">{sub}</div>}</div>
      </div>
      {children}
    </header>
  );
}
