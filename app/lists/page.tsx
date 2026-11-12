'use client';
import Link from 'next/link';
import { Feed, Header, Icon } from '@/components/ui';
type L = { id: string; name: string; desc?: string; members?: number };
export default function Lists() {
  return (<><Header title="リスト" back={false} />
    <Feed<L> op="lists" keyOf={(l) => l.id} empty="リストはありません" render={(l) => (
      <Link href={`/lists/${l.id}?n=${encodeURIComponent(l.name)}`} className="urow sl"><span className="list-ic"><Icon n="list_alt" /></span>
        <div className="ur-t"><b>{l.name}</b>{l.desc && <span className="muted small clamp2">{l.desc}</span>}{l.members != null && <span className="muted small">{l.members}人のメンバー</span>}</div></Link>)} /></>);
}
