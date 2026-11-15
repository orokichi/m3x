'use client';
import { useState } from 'react';
import { useGroq } from '@/lib/ai';
import { useAi } from '@/lib/aiTasks';
import { keepAskJob, keepTagsJob, parseGroups, type KeepLite } from '@/lib/aiPrompts';
import { memo, useMemo2, snapshot, undo, KEEP, type Item } from '@/lib/memo';
import { toast } from '@/lib/api';
import { AiText } from './AiText';
import GroqMark from './GroqMark';
import { Icon } from './ui';

const liteOf = (i: Item): KeepLite => ({ id: i.id, handle: i.src.handle, text: i.src.text, media: i.media ? (i.media.type === 'photo' ? '画像' : i.media.type === 'gif' ? 'GIF' : '動画') : undefined });

/** Keep AI: ask questions over Keep, and folder suggestions that are applied ONLY when the user clicks. */
export default function KeepAi() {
  const has = useGroq();
  const st = useMemo2();
  const ask = useAi(), tags = useAi();
  const [q, setQ] = useState('');
  const [done, setDone] = useState<Set<number>>(new Set());
  const [undoable, setUndoable] = useState(false);
  const [base, setBase] = useState<Item[]>([]);
  if (!has) return null;
  const items = st.folders.find((f) => f.id === KEEP)?.items || [];
  const all = st.folders.flatMap((f) => f.items || []);
  const groups = tags.out ? parseGroups(tags.out, base.length) : [];
  const apply = (gi: number) => {
    const g = groups[gi]; if (!g) return;
    if (!undoable) snapshot();
    const ex = st.folders.find((f) => f.name.toLowerCase() === g.name.toLowerCase());
    const to = ex ? ex.id : memo.addFolder(g.name);
    const n = memo.moveItems(g.idx.map((i) => base[i]?.id).filter(Boolean) as string[], to);
    setDone(new Set([...done, gi])); setUndoable(true);
    toast(`${n}件を「${g.name}」へ移動しました`);
  };
  return (
    <section className="ai-card thin keep-ai">
      <div className="ai-h"><GroqMark compact size={18} /><b>Keep に質問</b><span className="spacer" /><span className="muted small">{all.length}件</span></div>
      <form className="ai-ask" onSubmit={(e) => { e.preventDefault(); const t = q.trim(); if (t && all.length) ask.run(keepAskJob(t, all.map(liteOf))); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例: 保存したレシピは？ / 先週の AI ニュースをまとめて" aria-label="Keep に質問" disabled={!all.length} />
        <button className="icon-btn filled" type="submit" disabled={ask.busy || !q.trim() || !all.length} aria-label="送信"><Icon n="arrow_upward" /></button>
      </form>
      {!all.length && <p className="muted small" style={{ margin: 0 }}>Keep にポストを保存すると質問できます。</p>}
      {ask.busy && <div className="ai-skel"><i /><i /></div>}{ask.err && <p className="c-err small">{ask.err}</p>}
      {ask.out && <AiText text={ask.out} />}
      {items.length >= 3 && <div className="kai-tags">
        <div className="row-flex"><Icon n="label" s={18} /><b className="small">フォルダ分けの提案</b><span className="spacer" />
          <button className="btn tonal sm" onClick={() => { setDone(new Set()); setUndoable(false); setBase(items); tags.run(keepTagsJob(items.map(liteOf), st.folders.filter((f) => f.id !== KEEP).map((f) => f.name)), !!tags.out); }} disabled={tags.busy}><Icon n="auto_awesome" s={16} />{tags.out ? '再提案' : '提案を見る'}</button></div>
        {tags.busy && <div className="ai-skel"><i /><i /></div>}{tags.err && <p className="c-err small">{tags.err}</p>}
        {tags.out && !groups.length && <p className="muted small">提案がありませんでした。</p>}
        {!!groups.length && <ul className="kai-list">{groups.map((g, i) => (
          <li key={i} className={done.has(i) ? 'done' : ''}><Icon n="folder" s={18} fill /><b className="ell">{g.name}</b><span className="muted small">{g.idx.length}件</span>
            <span className="kai-who ell muted small">{g.idx.slice(0, 3).map((n) => '@' + base[n]?.src.handle).join(' ')}</span><span className="spacer" />
            {done.has(i) ? <span className="small c-primary"><Icon n="check" s={16} />適用済み</span> : <button className="btn text sm" onClick={() => apply(i)}>適用</button>}
          </li>))}</ul>}
        {!!groups.length && <p className="muted small" style={{ margin: 0 }}>「適用」を押したものだけが移動されます。{undoable && <button className="btn text sm" onClick={() => { if (undo()) { setUndoable(false); setDone(new Set()); toast('元に戻しました'); } }}><Icon n="undo" s={16} />元に戻す</button>}</p>}
      </div>}
    </section>
  );
}
