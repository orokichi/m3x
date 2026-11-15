'use client';
import { Feed, Header } from '@/components/ui';
import Notif from '@/components/Notif';
import type { XNotif } from '@/lib/types';

export default function Notifications() {
  return (
    <>
      <Header title="通知" back={false} />
      <Feed<XNotif> op="notifications" keyOf={(n) => n.id} render={(n) => <Notif n={n} />} empty="通知はまだありません" />
    </>
  );
}
