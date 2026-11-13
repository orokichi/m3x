'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { img } from '@/lib/api';
import { memo, useMemo2, readDrop2, hasDrop, ensureKeep, KEEP, MAX_SRC, type Folder, type Note, type Src, type Item, type Drop } from '@/lib/memo';
import { Icon } from './ui';
import { Img } from './Media';

const Lightbox = dynamic(() => import('./Lightbox'), { ssr: false });

const mapUrl = (p: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p)}`;

/** Drop target for posts / single media dragged from the timeline. */
export function useDrop(on: (d: Drop) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragEnter: (e: React.DragEvent) => { if (hasDrop(e)) { e.preventDefault(); setOver(true); } },
      onDragOver: (e: React.DragEvent) => { if (hasDrop(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
      onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); },
      onDrop: (e: React.DragEvent) => { setOver(false); const d = readDrop2(e); if (d) { e.preventDefault(); e.stopPropagation(); on(d); } },
    },
  };
}

function NameInput({ init, onDone, ph }: { init: string; onDone: (v: string | null) => void; ph: string }) {
  const [v, setV] = useState(init);
  const done = useRef(false);
  const fin = (x: string | null) => { if (!done.current) { done.current = true; onDone(x); } };
  return (
    <form className="mx-name" onSubmit={(e) => { e.preventDefault(); fin(v.trim() || null); }}>
      <input autoFocus value={v} maxLength={80} placeholder={ph} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && fin(null)} onBlur={() => fin(v.trim() || null)} aria-label={ph} />
      <button className="icon-btn sm" type="submit" aria-label="決定"><Icon n="check" s={20} /></button>
    </form>
  );
}

function Confirm({ label, onYes, onNo }: { label: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="mx-confirm"><span className="ell">{label}</span>
      <button className="btn text sm" onClick={onNo}>キャンセル</button>
      <button className="btn filled sm danger-f" onClick={onYes}>削除</button>
    </div>
  );
}

const fIcon = (f: Folder) => (f.keep ? 'bookmarks' : 'folder');
const fCount = (f: Folder) => f.notes.length + (f.items?.length || 0);

function FolderRow({ f, open }: { f: Folder; open: () => void }) {
  const [mode, setMode] = useState<'' | 'rename' | 'del'>('');
  const d = useDrop((x) => memo.addItem(x, f.id));
  useEffect(() => { if (!d.over || f.keep) return; const t = setTimeout(open, 900); return () => clearTimeout(t); /* spring-loaded folder */ }, [d.over]); // eslint-disable-line react-hooks/exhaustive-deps
  if (mode === 'rename') return <div className="mx-row"><Icon n="folder" /><NameInput init={f.name} ph="フォルダ名" onDone={(v) => { if (v) memo.renameFolder(f.id, v); setMode(''); }} /></div>;
  if (mode === 'del') return <div className="mx-row"><Confirm label={`「${f.name}」と中身${fCount(f)}件を削除しますか？`} onYes={() => memo.delFolder(f.id)} onNo={() => setMode('')} /></div>;
  return (
    <div className={'mx-row sl' + (d.over ? ' over' : '') + (f.keep ? ' keep' : '')} data-fid={f.id} {...d.props}>
      <button className="mx-open" onClick={open} title={f.name} data-ax={`folder:${f.id}`} data-ax-label={f.keep ? 'Keep（保存済みポスト）' : `フォルダ「${f.name}」`}>
        <Icon n={fIcon(f)} fill /><span className="ell">{f.name}{f.keep && <span className="mx-sub">ポストや画像をドロップして保存</span>}</span><span className="mx-count">{fCount(f)}</span>
      </button>
      {f.keep ? <span className="mx-lock" title="Keep は削除できません"><Icon n="lock" s={16} /></span> : <>
        <button className="icon-btn sm" onClick={() => setMode('rename')} aria-label="名前を変更" title="名前を変更"><Icon n="edit" s={18} /></button>
        <button className="icon-btn sm" onClick={() => setMode('del')} aria-label="削除" title="削除"><Icon n="delete" s={18} /></button>
      </>}
    </div>
  );
}

/** Saved posts / media as a grid. */
export function ItemGrid({ f, items, compact }: { f: Folder; items: Item[]; compact?: boolean }) {
  const [view, setView] = useState<Item | null>(null);
  if (!items.length) return null;
  return (
    <>
      <div className={'kp-grid' + (compact ? ' compact' : '')}>
        {items.map((it) => (
          <div key={it.id} className={'kp-tile' + (it.media ? ' media' : ' post')}>
            {it.media ? (
              <button className="kp-media sl" onClick={() => setView(it)} title={`@${it.src.handle}: ${it.src.text.slice(0, 60)}`}>
                <Img src={it.media.type === 'photo' ? it.media.url : it.media.thumb || it.media.url} />
                {it.media.type !== 'photo' && <span className="kp-badge"><Icon n={it.media.type === 'gif' ? 'gif' : 'play_arrow'} s={16} fill /></span>}
              </button>
            ) : (
              <Link href={`/status/${it.src.id}`} className="kp-post sl">
                <span className="kp-ph">
                  {it.src.avatar ? <img className="av" src={img(it.src.avatar)} alt="" width={18} height={18} referrerPolicy="no-referrer" loading="lazy" /> : <span className="av ph" style={{ width: 18, height: 18 }}>{it.src.name[0]}</span>}
                  <b className="ell">{it.src.name}</b>
                </span>
                <span className="kp-txt">{it.src.text || '（本文なし）'}</span>
                {it.src.image && <img className="kp-pimg" src={img(it.src.image, 'thumb')} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
              </Link>
            )}
            <button className="kp-x" onClick={() => memo.delItem(f.id, it.id)} aria-label="削除" title="削除"><Icon n="close" s={16} /></button>
          </div>
        ))}
      </div>
      {view?.media && (view.media.type === 'photo'
        ? <Lightbox urls={[view.media.url]} onClose={() => setView(null)} />
        : <Lightbox urls={[]} video={{ src: view.media.video || '', poster: view.media.thumb, gif: view.media.type === 'gif' }} onClose={() => setView(null)} />)}
    </>
  );
}

function NoteCard({ f, n, open, label }: { f: Folder; n: Note; open: () => void; label?: string }) {
  const d = useDrop((x) => memo.addSource(f.id, n.id, x.src));
  return (
    <button className={'mx-note' + (d.over ? ' over' : '')} onClick={open} {...d.props} data-ax={`note:${n.id}`} data-ax-label={`ノート「${n.title || '無題のノート'}」`}>
      <b className="clamp2">{n.title || '無題のノート'}</b>
      {n.body && <span className="mx-nb">{n.body}</span>}
      <span className="mx-nf">
        {label && <span className="mx-mini" title={label}><Icon n="folder" s={14} /><span className="ell">{label}</span></span>}
        {n.place && <span className="mx-mini" title={n.place}><Icon n="location_on" s={14} /><span className="ell">{n.place}</span></span>}
        {!!n.sources.length && <span className="mx-mini"><Icon n="link" s={14} />{n.sources.length}</span>}
      </span>
      {d.over && <span className="mx-drop-hint"><Icon n="add_link" />ここにドロップ</span>}
    </button>
  );
}

function SrcItem({ s, onDel }: { s: Src; onDel: () => void }) {
  return (
    <div className="mx-src">
      <Link href={`/status/${s.id}`} className="mx-src-l sl">
        {s.avatar ? <img className="av" src={img(s.avatar)} alt="" width={24} height={24} referrerPolicy="no-referrer" loading="lazy" /> : <span className="av ph" style={{ width: 24, height: 24 }}>{s.name[0]}</span>}
        <span className="mx-src-t">
          <span className="mx-src-h"><b className="ell">{s.name}</b><span className="muted ell">@{s.handle}</span></span>
          <span className="clamp2 small">{s.text || '（本文なし）'}</span>
        </span>
        {s.image && <img className="mx-thumb" src={img(s.image, 'thumb')} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
      </Link>
      <button className="icon-btn sm" onClick={onDel} aria-label="参照を削除" title="参照を削除"><Icon n="close" s={18} /></button>
    </div>
  );
}

function NoteEditor({ f, n, back }: { f: Folder; n: Note; back: () => void }) {
  const [title, setTitle] = useState(n.title);
  const [body, setBody] = useState(n.body);
  const [slash, setSlash] = useState(false);
  const [placeIn, setPlaceIn] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const d = useDrop((x) => memo.addSource(f.id, n.id, x.src));
  useEffect(() => { setTitle(n.title); setBody(n.body); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [n.id]);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 120) + 'px'; } }, [body]);

  const check = (v: string, caret: number) => {
    const before = v.slice(0, caret);
    const m = before.match(/[/／]([^\s/／]{0,4})$/);
    if (m && m[1] === '場所') {
      const nb = before.slice(0, before.length - m[0].length) + v.slice(caret);
      setBody(nb); memo.editNote(f.id, n.id, { body: nb }); setSlash(false); setPlaceIn(n.place || ''); return;
    }
    setSlash(!!m && ('場所'.startsWith(m[1]) || 'ばしょ'.startsWith(m[1])));
  };
  const runSlash = () => {
    const el = ta.current; if (!el) return;
    const caret = el.selectionStart, before = body.slice(0, caret);
    const m = before.match(/[/／]([^\s/／]{0,4})$/);
    const nb = m ? before.slice(0, before.length - m[0].length) + body.slice(caret) : body;
    setBody(nb); memo.editNote(f.id, n.id, { body: nb }); setSlash(false); setPlaceIn(n.place || '');
  };
  const savePlace = (v: string | null) => { if (v != null && v.trim()) memo.editNote(f.id, n.id, { place: v.trim() }); setPlaceIn(null); ta.current?.focus(); };

  return (
    <div className={'mx-editor' + (d.over ? ' over' : '')} {...d.props}>
      <input className="mx-title" value={title} maxLength={120} placeholder="タイトル" aria-label="タイトル"
        onChange={(e) => { setTitle(e.target.value); memo.editNote(f.id, n.id, { title: e.target.value }); }} />
      <div className="mx-bodywrap">
        <textarea ref={ta} className="mx-body-ta" value={body} placeholder="ノートを入力…  「/場所」で場所を追加" aria-label="本文"
          onChange={(e) => { setBody(e.target.value); memo.editNote(f.id, n.id, { body: e.target.value }); if (!(e.nativeEvent as any).isComposing) check(e.target.value, e.target.selectionStart); }}
          onCompositionEnd={(e) => { const t = e.currentTarget; check(t.value, t.selectionStart); }}
          onKeyDown={(e) => { if (slash && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSlash(); } if (e.key === 'Escape') setSlash(false); }}
          onBlur={() => setTimeout(() => setSlash(false), 150)} />
        {slash && <div className="mx-slash" role="listbox"><button role="option" aria-selected onMouseDown={(e) => { e.preventDefault(); runSlash(); }}><Icon n="location_on" s={20} /><span><b>/場所</b><span className="muted small">住所や場所の名前を追加</span></span></button></div>}
      </div>
      {placeIn != null && (
        <form className="mx-place-in" onSubmit={(e) => { e.preventDefault(); savePlace(placeIn); }}>
          <Icon n="location_on" s={20} />
          <input autoFocus value={placeIn} maxLength={200} placeholder="住所や場所の名前" aria-label="場所" onChange={(e) => setPlaceIn(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && savePlace(null)} />
          <button className="icon-btn sm" type="submit" aria-label="保存"><Icon n="check" s={20} /></button>
          <button className="icon-btn sm" type="button" onClick={() => savePlace(null)} aria-label="キャンセル"><Icon n="close" s={20} /></button>
        </form>
      )}
      {n.place && placeIn == null && (
        <div className="mx-place">
          <a href={mapUrl(n.place)} target="_blank" rel="noreferrer" className="mx-pchip sl" title={`Google マップで「${n.place}」を開く`}><Icon n="location_on" s={18} /><span className="ell">{n.place}</span><Icon n="open_in_new" s={14} /></a>
          <button className="icon-btn sm" onClick={() => memo.editNote(f.id, n.id, { place: undefined })} aria-label="場所を削除" title="場所を削除"><Icon n="close" s={18} /></button>
        </div>
      )}
      <div className="mx-srch"><Icon n="link" s={18} /><b>参照ポスト</b><span className={'mx-count' + (n.sources.length >= MAX_SRC ? ' full' : '')}>{n.sources.length}/{MAX_SRC}</span></div>
      {n.sources.length ? <div className="mx-srcs">{n.sources.map((s) => <SrcItem key={s.id} s={s} onDel={() => memo.delSource(f.id, n.id, s.id)} />)}</div>
        : <div className={'mx-dropzone' + (d.over ? ' over' : '')}><Icon n="move_to_inbox" />タイムラインのポストをここへドラッグ<br /><span className="small">（スマホはポストの共有メニュー →「Keep に追加」）</span></div>}
      <div className="mx-foot">
        {del ? <Confirm label="このノートを削除しますか？" onYes={() => { memo.delNote(f.id, n.id); back(); }} onNo={() => setDel(false)} />
          : <><span className="muted small ell">更新 {new Date(n.updated).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span className="spacer" /><button className="btn text sm c-err" onClick={() => setDel(true)}><Icon n="delete" />削除</button></>}
      </div>
    </div>
  );
}

export function MemoExplorer({ page }: { page?: boolean }) {
  const st = useMemo2();
  const [fid, setFid] = useState<string | null>(null);
  const [nid, setNid] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const f = st.folders.find((x) => x.id === fid);
  const n = f?.notes.find((x) => x.id === nid);
  useEffect(() => { ensureKeep(); }, []);
  useEffect(() => { if (fid && !f) { setFid(null); setNid(null); } else if (nid && !n) setNid(null); }, [fid, nid, f, n]);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo(0, 0); }, [fid, nid]);
  const fd = useDrop((x) => f && memo.addItem(x, f.id));
  const all = page && !f ? st.folders.flatMap((x) => x.notes.map((nn) => ({ f: x, n: nn }))).sort((a, b) => b.n.updated - a.n.updated) : [];

  return (
    <section className={'memo-x' + (page ? ' page' : '')} aria-label="Keep">
      <div className="mx-head">
        {f ? <button className="icon-btn sl" onClick={() => (n ? setNid(null) : setFid(null))} aria-label="戻る"><Icon n="arrow_back" /></button> : <span className="mx-logo"><Icon n="sticky_note_2" fill /></span>}
        <nav className="mx-crumbs" aria-label="パンくずリスト">
          <button className={!f ? 'cur' : ''} onClick={() => { setFid(null); setNid(null); }}>Keep</button>
          {f && <><Icon n="chevron_right" s={18} /><button className={'ell' + (!n ? ' cur' : '')} onClick={() => setNid(null)} title={f.name}>{f.name}</button></>}
          {n && <><Icon n="chevron_right" s={18} /><span className="ell cur">{n.title || '無題のノート'}</span></>}
        </nav>
      </div>
      <div className={'mx-scroll' + (f && !n && fd.over ? ' over' : '')} ref={body} {...(f && !n ? fd.props : {})}>
        {!f && <>
          <div className="mx-tool">
            <button className="btn tonal sm" onClick={() => setAdding(true)}><Icon n="create_new_folder" />新しいフォルダ</button>
          </div>
          {adding && <div className="mx-row"><Icon n="folder" /><NameInput init="" ph="フォルダ名を入力" onDone={(v) => { if (v) memo.addFolder(v); setAdding(false); }} /></div>}
          {st.folders.map((x) => <FolderRow key={x.id} f={x} open={() => { setFid(x.id); setNid(null); }} />)}
          {st.folders.length < 2 && !adding && <div className="mx-empty"><Icon n="folder_open" s={40} /><p>フォルダを作ってノートを整理しましょう</p></div>}
          {page && !!all.length && <>
            <h3 className="mx-sec">すべてのノート<span className="mx-count">{all.length}</span></h3>
            <div className="mx-grid">{all.map(({ f: ff, n: nn }) => <NoteCard key={nn.id} f={ff} n={nn} label={ff.name} open={() => { setFid(ff.id); setNid(nn.id); }} />)}</div>
          </>}
          {page && st.folders[0]?.items?.length ? <>
            <h3 className="mx-sec">保存したポスト<button className="btn text sm" onClick={() => setFid(KEEP)}>すべて表示</button></h3>
            <ItemGrid f={st.folders[0]} items={st.folders[0].items!.slice(0, 24)} compact />
          </> : null}
        </>}
        {f && !n && <>
          <div className="mx-tool">
            <button className="btn filled sm" onClick={() => setNid(memo.addNote(f.id))}><Icon n="note_add" />ノートを新規作成</button>
            <span className="muted small">{f.items?.length ? `保存 ${f.items.length}件 · ` : ''}ノート {f.notes.length}件</span>
          </div>
          {f.keep && !f.items?.length && <div className={'mx-dropzone' + (fd.over ? ' over' : '')}><Icon n="bookmarks" />ポスト全体や、ポスト内の画像・動画・GIF を<br />ここへドラッグして保存<br /><span className="small">（スマホは共有メニュー →「Keep に追加」→ Keep）</span></div>}
          <ItemGrid f={f} items={f.items || []} />
          {f.notes.length ? <>{!!f.items?.length && <h3 className="mx-sec">ノート</h3>}<div className="mx-grid">{f.notes.map((x) => <NoteCard key={x.id} f={f} n={x} open={() => setNid(x.id)} />)}</div></>
            : !f.keep && !f.items?.length && <div className="mx-empty"><Icon n="sticky_note_2" s={40} /><p>まだノートがありません</p></div>}
        </>}
        {f && n && <NoteEditor f={f} n={n} back={() => setNid(null)} />}
      </div>
    </section>
  );
}

/** Non-drag fallback: pick folder + note for a post (touch devices). */
export default function MemoPicker({ src, onClose }: { src: Src; onClose: () => void }) {
  const st = useMemo2();
  const [fid, setFid] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { ensureKeep(); }, []);
  const f = st.folders.find((x) => x.id === fid);
  const close = onClose;
  const add = (noteId: string) => { memo.addSource(f!.id, noteId, src); close(); };
  return (
    <div className="dialog-scrim" onClick={close}>
      <div className="dialog mx-pick" role="dialog" aria-label="Keep に追加" onClick={(e) => e.stopPropagation()}>
        <div className="row-flex">
          {f ? <button className="icon-btn sl" onClick={() => setFid(null)} aria-label="戻る"><Icon n="arrow_back" /></button> : <button className="icon-btn sl" onClick={close} aria-label="閉じる"><Icon n="close" /></button>}
          <h2 className="ell" style={{ margin: 0, fontSize: 18 }}>{f ? f.name : 'Keep に追加'}</h2>
        </div>
        <p className="muted small clamp2" style={{ margin: '4px 0 12px' }}>@{src.handle}: {src.text}</p>
        <div className="mx-pick-list">
          {!f && <>
            {st.folders.map((x) => x.keep
              ? <button key={x.id} className="mx-row mx-open sl" onClick={() => { memo.addItem({ src }, KEEP); close(); }}><Icon n="bookmarks" fill /><span className="ell"><b>Keep に保存</b></span><Icon n="add" /></button>
              : <button key={x.id} className="mx-row mx-open sl" onClick={() => setFid(x.id)}><Icon n="folder" fill /><span className="ell">{x.name}</span><span className="mx-count">{x.notes.length}</span><Icon n="chevron_right" /></button>)}
            {adding ? <div className="mx-row"><Icon n="folder" /><NameInput init="" ph="フォルダ名を入力" onDone={(v) => { if (v) setFid(memo.addFolder(v)); setAdding(false); }} /></div>
              : <button className="btn tonal sm" style={{ margin: 8 }} onClick={() => setAdding(true)}><Icon n="create_new_folder" />新しいフォルダ</button>}
          </>}
          {f && <>
            <button className="mx-row mx-open sl" onClick={() => add(memo.addNote(f.id))}><Icon n="note_add" /><span className="ell"><b>新しいノートに追加</b></span></button>
            {f.notes.map((x) => <button key={x.id} className="mx-row mx-open sl" onClick={() => add(x.id)}><Icon n="sticky_note_2" /><span className="ell">{x.title || '無題のノート'}</span><span className={'mx-count' + (x.sources.length >= MAX_SRC ? ' full' : '')}>{x.sources.length}/{MAX_SRC}</span></button>)}
          </>}
        </div>
      </div>
    </div>
  );
}
