'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { x, getFollows } from '@/lib/api';
import type { XTweet, XUser, XNotif } from '@/lib/types';
import { deck, useDeck, COL_META, colTitle, type Col, type ColType } from '@/lib/deck';
import { Feed, FeedScope, Icon, Spinner, TweetCard, ErrorBox } from './ui';
import { DigestButton } from './AiTools';
import Notif from './Notif';

const MemoExplorer = dynamic(() => import('./Memo').then((m) => m.MemoExplorer), { ssr: false, loading: () => <Spinner /> });

const keyT = (t: XTweet) => t.id + (t.rtBy?.id || '');
const tw = (t: XTweet) => <TweetCard t={t} />;

function UserCol({ handle }: { handle: string }) {
  const [u, setU] = useState<XUser | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  useEffect(() => { x<XUser>('user', { handle }).then(setU).catch(setErr); }, [handle]);
  if (err) return <ErrorBox e={err} />;
  if (!u) return <Spinner />;
  return <Feed<XTweet> op="utweets" args={{ id: u.id, tab: 'posts' }} keyOf={keyT} render={tw} empty="ポストはありません" />;
}

function Body({ c, authed }: { c: Col; authed: boolean }) {
  const ids = getFollows().map((u) => u.id);
  switch (c.type) {
    case 'home': return <Feed<XTweet> op="home" args={authed ? { tab: 'foryou' } : { tab: 'foryou', ids }} keyOf={keyT} render={tw} empty="ポストがありません" />;
    case 'following': return !authed && !ids.length ? <div className="empty"><Icon n="group_add" s={40} /><p>ゲストモードのフォローはこの端末に保存されます。<br />まだ誰もフォローしていません。</p></div>
      : <Feed<XTweet> op="home" args={authed ? { tab: 'following' } : { tab: 'following', ids }} keyOf={keyT} render={tw} empty="フォロー中のアカウントに最近のポストはありません" />;
    case 'search': return <Feed<XTweet> op="search" args={authed ? { q: c.q, tab: 'latest' } : { q: c.q, tab: 'latest', ids }} keyOf={(t) => t.id} render={tw} empty={`「${c.q}」の検索結果はありません`} />;
    case 'list': return <Feed<XTweet> op="list" args={{ id: c.list }} keyOf={keyT} render={tw} empty="ポストがありません" />;
    case 'user': return <UserCol handle={c.handle || ''} />;
    case 'notifications': return authed ? <Feed<XNotif> op="notifications" keyOf={(n) => n.id} render={(n) => <Notif n={n} />} empty="通知はまだありません" />
      : <div className="empty"><Icon n="notifications" s={40} /><p>通知の表示にはログインが必要です</p></div>;
    case 'keep': return <div className="dcol-keep"><MemoExplorer /></div>;
  }
}

function Column({ c, i, n, authed }: { c: Col; i: number; n: number; authed: boolean }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [k, setK] = useState(0);
  const feedy = c.type !== 'keep' && c.type !== 'notifications';
  return (
    <section className={'dcol' + (c.type === 'keep' ? ' keep' : '')} aria-label={colTitle(c)}>
      <header className="dcol-h">
        <span className="dcol-ic"><Icon n={COL_META[c.type][0]} fill /></span>
        <b className="ell" title={colTitle(c)}>{colTitle(c)}</b>
        <span className="spacer" />
        {feedy && <DigestButton compact scope={() => el} />}
        {c.type !== 'keep' && <button className="icon-btn sm" onClick={() => { el?.scrollTo({ top: 0 }); setK(k + 1); }} title="更新" aria-label="更新"><Icon n="refresh" s={20} /></button>}
        <details className="dcol-more">
          <summary className="icon-btn sm" aria-label="カラムの操作" title="カラムの操作"><Icon n="more_vert" s={20} /></summary>
          <div className="menu r" role="menu">
            <button role="menuitem" disabled={i === 0} onClick={() => deck.move(c.id, -1)}><Icon n="chevron_left" />左へ移動</button>
            <button role="menuitem" disabled={i === n - 1} onClick={() => deck.move(c.id, 1)}><Icon n="chevron_right" />右へ移動</button>
            <button role="menuitem" onClick={() => deck.remove(c.id)}><Icon n="delete" />カラムを削除</button>
          </div>
        </details>
      </header>
      <div className="dcol-b" ref={setEl} onClick={(e) => { const d = (e.currentTarget.parentElement?.querySelector('.dcol-more') as HTMLDetailsElement | null); if (d?.open) d.open = false; }}>
        {el && <FeedScope.Provider value={el}><Body key={k} c={c} authed={authed} /></FeedScope.Provider>}
      </div>
    </section>
  );
}

function AddColumn({ authed }: { authed: boolean }) {
  const [type, setType] = useState<ColType>('search');
  const [v, setV] = useState('');
  const [lists, setLists] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => { if (type === 'list' && authed && !lists) x<{ list: { id: string; name: string }[] }>('lists').then((p) => setLists(p.list)).catch(() => setLists([])); }, [type, authed, lists]);
  const need = type === 'search' || type === 'user' || type === 'list';
  const add = () => {
    const s = v.trim();
    if (type === 'search') { if (!s) return; deck.add({ type, q: s }); }
    else if (type === 'user') { const h = s.replace(/^.*x\.com\//, '').replace(/^[@＠]/, '').split(/[/?]/)[0]; if (!/^\w{1,15}$/.test(h)) return; deck.add({ type, handle: h }); }
    else if (type === 'list') { const id = (s.match(/(\d{5,})/) || [])[1]; if (!id) return; deck.add({ type, list: id, name: lists?.find((l) => l.id === id)?.name }); }
    else deck.add({ type });
    setV('');
  };
  const types: ColType[] = ['home', 'following', 'search', 'list', 'user', 'notifications', 'keep'];
  return (
    <section className="dcol add" aria-label="カラムを追加">
      <header className="dcol-h"><span className="dcol-ic"><Icon n="add" /></span><b>カラムを追加</b></header>
      <form className="dadd" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="dadd-types" role="radiogroup" aria-label="種類">
          {types.map((t) => <button type="button" key={t} role="radio" aria-checked={type === t} className={'chip' + (type === t ? ' on' : '')} onClick={() => { setType(t); setV(''); }}><Icon n={COL_META[t][0]} s={18} />{COL_META[t][1]}</button>)}
        </div>
        {type === 'search' && <label className="field"><span>検索ワード</span><input value={v} onChange={(e) => setV(e.target.value)} placeholder="例: #ニュース OR 地震" /></label>}
        {type === 'user' && <label className="field"><span>ユーザー</span><input value={v} onChange={(e) => setV(e.target.value)} placeholder="@handle" /></label>}
        {type === 'list' && <>
          {authed && lists?.length ? <label className="field"><span>リスト</span><select value={v} onChange={(e) => setV(e.target.value)}><option value="">選択…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            : <label className="field"><span>リストの URL / ID</span><input value={v} onChange={(e) => setV(e.target.value)} placeholder="https://x.com/i/lists/123…" /></label>}
        </>}
        {type === 'notifications' && !authed && <p className="muted small">通知はログイン時のみ表示されます。</p>}
        <button className="btn filled" type="submit" disabled={need && !v.trim()}><Icon n="add" />追加</button>
      </form>
      <div className="dadd-foot">
        <button className="btn text sm" onClick={() => deck.reset()}><Icon n="restore" s={18} />初期カラムに戻す</button>
        <button className="btn outlined sm" onClick={() => deck.setOn(false)}><Icon n="view_agenda" s={18} />1カラム表示に戻す</button>
      </div>
    </section>
  );
}

/** TweetDeck-style multi-column home (≥1600px, toggled in settings). */
export default function Deck({ authed }: { authed: boolean }) {
  const d = useDeck();
  const wrap = useRef<HTMLDivElement>(null);
  return (
    <div className="deck" ref={wrap} style={d.width ? { ['--dcol' as any]: `${d.width}px` } : undefined}>
      {d.cols.map((c, i) => <Column key={c.id} c={c} i={i} n={d.cols.length} authed={authed} />)}
      <AddColumn authed={authed} />
    </div>
  );
}
