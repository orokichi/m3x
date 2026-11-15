'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { applyTheme } from '@/lib/themeStore';
import { x, getCreds, shrink, toast } from '@/lib/api';
import type { XTweet, XUser } from '@/lib/types';
import { Avatar, Icon, RichText } from './ui';
import { type Src } from '@/lib/memo';
import { useDeck, DECK_MIN } from '@/lib/deck';
import { ComposeAssist } from './AiTools';

const SidePanel = dynamic(() => import('./SidePanel'), { ssr: false, loading: () => <div className="sp sp-skel" /> });
const TrendsPanel = dynamic(() => import('./Trends'), { ssr: false, loading: () => <div className="tp sp-skel" /> });
const Deck = dynamic(() => import('./Deck'), { ssr: false, loading: () => <div className="deck" /> });
const MemoPicker = dynamic(() => import('./Memo'), { ssr: false });

const Me = createContext<{ me: XUser | null; authed: boolean; ready: boolean }>({ me: null, authed: false, ready: false });
export const useMe = () => useContext(Me);

export function compose(detail: { replyTo?: XTweet; quote?: XTweet; text?: string } = {}) { window.dispatchEvent(new CustomEvent('m3x-compose', { detail })); }

function Composer({ me, onClose, replyTo, quote, text: init }: { me: XUser | null; onClose: () => void; replyTo?: XTweet; quote?: XTweet; text?: string }) {
  const [text, setText] = useState(init || '');
  const [imgs, setImgs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const len = Array.from(text).length;
  const add = async (fs: FileList | null) => {
    if (!fs) return;
    const out: string[] = [];
    for (const f of Array.from(fs).slice(0, 4 - imgs.length)) if (f.type.startsWith('image/')) out.push(await shrink(f));
    setImgs([...imgs, ...out]);
  };
  const post = async () => {
    setBusy(true);
    try {
      const id = await x<string>('post', { text, images: imgs, replyTo: replyTo?.id, quote: quote?.id });
      toast(replyTo ? '返信しました' : 'ポストしました'); onClose();
      if (id && !replyTo) router.push(`/status/${id}`); else router.refresh();
    } catch (e: any) { toast(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="dialog-scrim" onClick={onClose}>
      <div className="dialog compose" onClick={(e) => e.stopPropagation()} onPaste={(e) => add(e.clipboardData.files)}>
        <div className="row-flex"><button className="icon-btn sl" onClick={onClose} aria-label="閉じる"><Icon n="close" /></button><span className="spacer" /></div>
        {replyTo && <div className="reply-ctx"><Avatar u={replyTo.user} /><div><b>{replyTo.user.name}</b> <span className="muted">@{replyTo.user.handle}</span><div className="clamp3"><RichText t={replyTo} /></div><div className="muted small" style={{ marginTop: 8 }}>返信先: <span className="lnk">@{replyTo.user.handle}</span></div></div></div>}
        <div className="row-flex" style={{ alignItems: 'flex-start', gap: 12 }}>
          <Avatar u={me || undefined} />
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={replyTo ? '返信をポスト' : quote ? 'コメントを追加' : 'いまどうしてる？'} rows={4} />
        </div>
        <ComposeAssist text={text} setText={setText} replyTo={replyTo} />
        {!!imgs.length && <div className="cimgs">{imgs.map((s, i) => <div key={i}><img src={s} alt="" /><button className="icon-btn" onClick={() => setImgs(imgs.filter((_, j) => j !== i))}><Icon n="close" s={18} /></button></div>)}</div>}
        {quote && <div className="quote" style={{ marginLeft: 52 }}><div className="qhead"><Avatar u={quote.user} size={20} /><b>{quote.user.name}</b><span className="muted">@{quote.user.handle}</span></div><div className="qtext clamp3"><RichText t={quote} /></div></div>}
        <div className="ctools">
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
          <button className="icon-btn sl c-primary" onClick={() => file.current?.click()} disabled={imgs.length >= 4} aria-label="画像"><Icon n="image" /></button>
          <span className="spacer" />
          <span className={'small ' + (len > 280 ? 'c-err' : 'muted')}>{len}/280</span>
          <button className="btn filled" disabled={busy || (!text.trim() && !imgs.length)} onClick={post}>{busy ? '送信中…' : replyTo ? '返信' : 'ポストする'}</button>
        </div>
      </div>
    </div>
  );
}

/** Media-query hook (client only; false on the server). */
export function useMQ(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [q]);
  return m;
}

function SearchBox() {
  const [q, setQ] = useState('');
  const router = useRouter();
  return (
    <form className="sbox" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
      <Icon n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="検索" aria-label="検索" />
    </form>
  );
}

/** Persistent right column on desktop: Trends / Keep / Groq. ≥1760px splits trends into its own column. */
function RightBar({ path, deckOn }: { path: string; deckOn?: boolean }) {
  const on = useMQ('(min-width: 1061px)');
  const split = useMQ('(min-width: 1760px)');
  const isKeep = path.startsWith('/keep');
  const isSearch = path.startsWith('/explore') || path.startsWith('/search');
  const foot = <footer className="muted small rb-foot">Xplore（エクスプロア） · 非公式クライアント（X Corp. とは無関係）</footer>;
  if (!on) return <aside className="rightbar" aria-hidden />;
  if (isKeep) return <aside className="rightbar panel-mode"><SidePanel agentOnly />{foot}</aside>;
  if (split && !deckOn) return <>
    <aside className="rightbar panel-mode"><SidePanel pages={['keep', 'groq']} />{foot}</aside>
    <aside className="rightbar2">{!isSearch && <SearchBox />}<div className="rcard tcard"><TrendsPanel /></div></aside>
  </>;
  return <aside className="rightbar panel-mode">{!isSearch && <SearchBox />}<SidePanel pages={['trends', 'keep', 'groq']} />{foot}</aside>;
}

const NAV = [
  ['/', 'home', 'ホーム'], ['/explore', 'search', '検索'], ['/notifications', 'notifications', '通知'],
  ['/keep', 'bookmarks', 'Keep'], ['/following', 'group', 'フォロー'],
  ['/lists', 'list_alt', 'リスト'], ['/profile', 'person', 'プロフィール'], ['/settings', 'settings', '設定'],
] as const;
const GUEST = new Set(['/', '/explore', '/following', '/keep', '/settings']);
const MOBILE_AUTHED = new Set(['/', '/explore', '/following', '/notifications', '/profile', '/keep']);

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<XUser | null>(null);
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [comp, setComp] = useState<null | { replyTo?: XTweet; quote?: XTweet; text?: string }>(null);
  const [toasts, setToasts] = useState<{ id: number; m: string }[]>([]);
  const [pick, setPick] = useState<Src | null>(null);
  const d = useDeck();
  const deckWide = useMQ(`(min-width: ${DECK_MIN}px)`);
  const deckOn = d.on && deckWide && path === '/';

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const th = () => { applyTheme(); }; th(); mq.addEventListener('change', th);
    const auth = () => { const c = !!getCreds(); setAuthed(c); setReady(true); if (c) x<XUser>('me').then(setMe).catch(() => setMe(null)); else setMe(null); };
    auth();
    const onC = (e: any) => setComp(e.detail || {});
    const onT = (e: any) => { const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, m: e.detail }]); setTimeout(() => setToasts((t) => t.filter((i) => i.id !== id)), 3500); };
    const onP = (e: any) => setPick(e.detail);
    window.addEventListener('m3x-auth', auth); window.addEventListener('m3x-compose', onC); window.addEventListener('m3x-toast', onT); window.addEventListener('m3x-memo-pick', onP);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => { mq.removeEventListener('change', th); window.removeEventListener('m3x-auth', auth); window.removeEventListener('m3x-compose', onC); window.removeEventListener('m3x-toast', onT); window.removeEventListener('m3x-memo-pick', onP); };
  }, []);

  const nav = NAV.filter(([h]) => authed || GUEST.has(h));
  const href = (h: string) => (h === '/profile' ? (me ? `/u/${me.handle}` : '/settings') : h);
  const on = (h: string) => (h === '/' ? path === '/' : h === '/profile' ? !!me && path.startsWith(`/u/${me.handle}`) : h === '/explore' ? path.startsWith('/explore') || path.startsWith('/search') : path.startsWith(h));

  return (
    <Me.Provider value={{ me, authed, ready }}>
      <div className={'layout' + (deckOn ? ' deck-on' : '')}>
        <nav className="leftnav">
          <Link href="/" className="logo-x" aria-label="Xplore（エクスプロア）"><span className="lm">X</span><span className="lt">Xplore</span></Link>
          {nav.map(([h, ic, label]) => (
            <Link key={h} href={href(h)} className={'nav-i' + (on(h) ? ' on' : '')}><span className="pill"><Icon n={ic} fill={on(h)} /></span><span className="nl">{label}</span></Link>
          ))}
          {authed && <button className="btn filled lg post-btn" onClick={() => compose()}><Icon n="edit" /><span className="nl">ポストする</span></button>}
          <span className="spacer" />
          {me ? <Link href={`/u/${me.handle}`} className="me-card sl"><Avatar u={me} /><div className="nl ur-t"><b className="ell">{me.name}</b><span className="muted ell">@{me.handle}</span></div></Link>
            : ready && <div className="me-card"><span className="av ph" style={{ width: 40, height: 40 }}><Icon n="visibility" /></span><div className="nl ur-t"><b>ゲストモード</b><span className="muted small">ログインなしで閲覧中</span></div></div>}
        </nav>
        {deckOn ? <main className="deck-main"><Deck authed={authed} /></main> : <main className="center">{children}</main>}
        <RightBar path={path} deckOn={deckOn} />
      </div>
      <nav className="bottomnav">
        {(authed ? nav.filter(([h]) => MOBILE_AUTHED.has(h)) : nav).map(([h, ic, label]) => (
          <Link key={h} href={href(h)} className={on(h) ? 'on' : ''} aria-label={label}><span className="pill"><Icon n={ic} fill={on(h)} /></span></Link>
        ))}
      </nav>
      {authed && !path.startsWith('/settings') && <button className="fab" onClick={() => compose()} aria-label="ポストする"><Icon n="edit" /></button>}
      {pick && <MemoPicker src={pick} onClose={() => setPick(null)} />}
      {comp && <Composer me={me} {...comp} onClose={() => setComp(null)} />}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.m}</div>)}</div>
    </Me.Provider>
  );
}
