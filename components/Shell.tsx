'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { applyTheme } from '@/lib/theme';
import { x, getCreds, shrink, toast, fmtNum } from '@/lib/api';
import type { XTweet, XUser, XTrend } from '@/lib/types';
import { Avatar, Icon, RichText, Verified } from './ui';
import { MemoExplorer, MemoPicker } from './Memo';
import { useMemoOn } from '@/lib/memo';
import { useGroq } from '@/lib/ai';

const Me = createContext<{ me: XUser | null; authed: boolean; ready: boolean }>({ me: null, authed: false, ready: false });
export const useMe = () => useContext(Me);
export const SEED = '#1d9bf0';

export function compose(detail: { replyTo?: XTweet; quote?: XTweet } = {}) { window.dispatchEvent(new CustomEvent('m3x-compose', { detail })); }

function Composer({ me, onClose, replyTo, quote }: { me: XUser | null; onClose: () => void; replyTo?: XTweet; quote?: XTweet }) {
  const [text, setText] = useState('');
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

function RightBar({ path, memo }: { path: string; memo: boolean }) {
  if (memo) return <aside className="rightbar memo-mode"><MemoExplorer /></aside>;
  return <Trends path={path} />;
}

function Trends({ path }: { path: string }) {
  const [trends, setTrends] = useState<XTrend[] | null>(null);
  const [q, setQ] = useState('');
  const router = useRouter();
  useEffect(() => { x<XTrend[]>('trends').then(setTrends).catch(() => setTrends([])); }, []);
  return (
    <aside className="rightbar">
      <form className="sbox" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
        <Icon n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="検索" aria-label="検索" />
      </form>
      {!path.startsWith('/explore') && <section className="rcard">
        <h2>日本のトレンド</h2>
        {trends === null && <div className="muted small" style={{ padding: 16 }}>読み込み中…</div>}
        {trends?.slice(0, 10).map((t, i) => (
          <Link key={t.name} href={`/search?q=${encodeURIComponent(t.query)}`} className="trend sl">
            <span className="muted small">{i + 1} · トレンド</span><b>{t.name}</b>{t.volume && <span className="muted small">{fmtNum(t.volume)}件のポスト</span>}
          </Link>
        ))}
        <Link href="/explore" className="trend sl lnk">さらに表示</Link>
      </section>}
      <footer className="muted small" style={{ padding: '0 16px' }}>M3X · 非公式クライアント（X Corp. とは無関係）</footer>
    </aside>
  );
}

const NAV = [
  ['/', 'home', 'ホーム'], ['/explore', 'search', '話題を検索'], ['/notifications', 'notifications', '通知'],
  ['/bookmarks', 'bookmark', 'ブックマーク'], ['/super-search', 'auto_awesome', 'Super Search'], ['/following', 'group', 'フォロー'],
  ['/lists', 'list_alt', 'リスト'], ['/profile', 'person', 'プロフィール'], ['/memo', 'sticky_note_2', 'メモ'], ['/settings', 'settings', '設定'],
] as const;
const GUEST = new Set(['/', '/explore', '/super-search', '/following', '/memo', '/settings']);
const MOBILE_AUTHED = new Set(['/', '/explore', '/super-search', '/following', '/notifications', '/bookmarks', '/profile', '/memo']);

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [me, setMe] = useState<XUser | null>(null);
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [comp, setComp] = useState<null | { replyTo?: XTweet; quote?: XTweet }>(null);
  const [toasts, setToasts] = useState<{ id: number; m: string }[]>([]);
  const memo = useMemoOn();
  const groq = useGroq();

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const th = () => applyTheme(SEED, 'system'); th(); mq.addEventListener('change', th);
    const auth = () => { const c = !!getCreds(); setAuthed(c); setReady(true); if (c) x<XUser>('me').then(setMe).catch(() => setMe(null)); else setMe(null); };
    auth();
    const onC = (e: any) => setComp(e.detail || {});
    const onT = (e: any) => { const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, m: e.detail }]); setTimeout(() => setToasts((t) => t.filter((i) => i.id !== id)), 3500); };
    window.addEventListener('m3x-auth', auth); window.addEventListener('m3x-compose', onC); window.addEventListener('m3x-toast', onT);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => { mq.removeEventListener('change', th); window.removeEventListener('m3x-auth', auth); window.removeEventListener('m3x-compose', onC); window.removeEventListener('m3x-toast', onT); };
  }, []);

  const nav = NAV.filter(([h]) => (authed || GUEST.has(h)) && (h !== '/super-search' || groq) && (h !== '/memo' || memo));
  const href = (h: string) => (h === '/profile' ? (me ? `/u/${me.handle}` : '/settings') : h);
  const on = (h: string) => (h === '/' ? path === '/' : h === '/profile' ? !!me && path.startsWith(`/u/${me.handle}`) : path.startsWith(h));

  return (
    <Me.Provider value={{ me, authed, ready }}>
      <div className="layout">
        <nav className="leftnav">
          <Link href="/" className="logo-x" aria-label="M3X"><span className="lm">X</span><span className="lt">M3X</span></Link>
          {nav.map(([h, ic, label]) => (
            <Link key={h} href={href(h)} className={'nav-i' + (on(h) ? ' on' : '') + (h === '/memo' ? ' memo-only' : '')}><span className="pill"><Icon n={ic} fill={on(h)} /></span><span className="nl">{label}</span></Link>
          ))}
          {authed && <button className="btn filled lg post-btn" onClick={() => compose()}><Icon n="edit" /><span className="nl">ポストする</span></button>}
          <span className="spacer" />
          {me ? <Link href={`/u/${me.handle}`} className="me-card sl"><Avatar u={me} /><div className="nl ur-t"><b className="ell">{me.name}</b><span className="muted ell">@{me.handle}</span></div></Link>
            : ready && <div className="me-card"><span className="av ph" style={{ width: 40, height: 40 }}><Icon n="visibility" /></span><div className="nl ur-t"><b>ゲストモード</b><span className="muted small">ログインなしで閲覧中</span></div></div>}
        </nav>
        <main className="center">{children}</main>
        <RightBar path={path} memo={memo} />
      </div>
      <nav className="bottomnav">
        {(authed ? nav.filter(([h]) => MOBILE_AUTHED.has(h)) : nav).map(([h, ic, label]) => (
          <Link key={h} href={href(h)} className={on(h) ? 'on' : ''} aria-label={label}><span className="pill"><Icon n={ic} fill={on(h)} /></span></Link>
        ))}
      </nav>
      {authed && !path.startsWith('/settings') && <button className="fab" onClick={() => compose()} aria-label="ポストする"><Icon n="edit" /></button>}
      <MemoPicker />
      {comp && <Composer me={me} {...comp} onClose={() => setComp(null)} />}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.m}</div>)}</div>
    </Me.Provider>
  );
}
