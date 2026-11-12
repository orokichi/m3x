'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { x } from '@/lib/api';
import { ErrorBox, Feed, Header, Spinner, Tabs, UserRow } from '@/components/ui';
import type { XUser } from '@/lib/types';

export default function Follows({ params }: { params: Promise<{ handle: string; kind: string }> }) {
  const { handle, kind } = use(params);
  const router = useRouter();
  const [u, setU] = useState<XUser | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  useEffect(() => { x<XUser>('user', { handle }).then(setU).catch(setErr); }, [handle]);
  return (
    <>
      <Header title={u?.name || '@' + handle} sub={'@' + handle}>
        <Tabs tabs={[['followers', 'フォロワー'], ['following', 'フォロー中']]} value={kind} onChange={(k) => router.replace(`/u/${handle}/${k}`)} />
      </Header>
      {err && <ErrorBox e={err} />}
      {!u && !err && <Spinner />}
      {u && <Feed<XUser> op="follows" args={{ id: u.id, kind }} keyOf={(i) => i.id} render={(i) => <UserRow u={i} />} />}
    </>
  );
}
