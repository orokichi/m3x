'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Feed, Header, RichText } from '@/components/ui';
import { fmtTime } from '@/lib/api';
import type { XNotif } from '@/lib/types';

const ICON: Record<string, [string, string]> = { LIKE: ['favorite', 'c-pink'], RETWEET: ['repeat', 'c-green'], FOLLOW: ['person', 'c-primary'], ALERT: ['notifications', 'c-primary'], RECOMMENDATION: ['auto_awesome', 'c-primary'] };

function N({ n }: { n: XNotif }) {
  const router = useRouter();
  const [ic, cl] = ICON[n.type || ''] || ['notifications', 'c-primary'];
  return (
    <div className="notif sl" onClick={() => (n.tweet ? router.push(`/status/${n.tweet.id}`) : n.users[0] && router.push(`/u/${n.users[0].handle}`))}>
      <span className={'ms fill n-ic ' + cl}>{ic}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row-flex" style={{ gap: 4 }}>{n.users.slice(0, 8).map((u) => <Link key={u.id} href={`/u/${u.handle}`} onClick={(e) => e.stopPropagation()}><Avatar u={u} size={32} /></Link>)}</div>
        <div className="n-msg">{n.message} <span className="muted small">{n.at && fmtTime(n.at)}</span></div>
        {n.tweet && <div className="muted clamp3"><RichText t={n.tweet} /></div>}
      </div>
    </div>
  );
}

export default function Notifications() {
  return (
    <>
      <Header title="通知" back={false} />
      <Feed<XNotif> op="notifications" keyOf={(n) => n.id} render={(n) => <N n={n} />} empty="通知はまだありません" />
    </>
  );
}
