'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { x, getCreds, setCreds, type Creds } from '@/lib/api';
import { Avatar, Header, Icon } from '@/components/ui';
import type { XUser } from '@/lib/types';

export default function Settings() {
  const router = useRouter();
  const [mode, setMode] = useState<'cookie' | 'key'>('cookie');
  const [c, setC] = useState<Creds>({});
  const [st, setSt] = useState<{ ok?: XUser; err?: string; busy?: boolean }>({});
  const [has, setHas] = useState(false);
  useEffect(() => { const g = getCreds(); setHas(!!g); if (g) { setC(g); if (g.apiKey) setMode('key'); } }, []);
  const save = async () => {
    const v: Creds = mode === 'key' ? { apiKey: c.apiKey?.trim() } : { authToken: c.authToken?.trim(), ct0: c.ct0?.trim(), twid: c.twid?.trim() };
    setCreds(v); setSt({ busy: true });
    try { const me = await x<XUser>('me'); setSt({ ok: me }); setHas(true); }
    catch (e: any) { setSt({ err: e.message }); }
  };
  const f = (k: keyof Creds, label: string, ph: string, hint?: string) => (
    <label className="field"><span>{label}</span><input type="password" autoComplete="off" spellCheck={false} value={c[k] || ''} onChange={(e) => setC({ ...c, [k]: e.target.value })} placeholder={ph} />{hint && <small className="muted">{hint}</small>}</label>
  );
  return (
    <>
      <Header title="設定・ログイン" back={false} />
      <div className="pad">
        <section className="scard warn">
          <Icon n="warning" /><div><b>注意</b><p>M3X は X の非公式（内部）API を使います。X の利用規約に反するため、アカウントが凍結・制限される可能性があります。<b>必ずサブアカウントで</b>使ってください。Cookie はこの端末のブラウザ（localStorage）にだけ保存され、サーバーには保存・記録されません。</p></div>
        </section>

        <section className="scard">
          <h2>Cookie の取り方（パソコンのブラウザ）</h2>
          <ol className="steps">
            <li>Chrome / Edge で <a className="lnk" href="https://x.com" target="_blank" rel="noreferrer">x.com</a> にサブアカウントでログインする</li>
            <li><kbd>F12</kbd>（Mac は <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>I</kbd>）で開発者ツールを開く</li>
            <li>「アプリケーション（Application）」タブ → 左の「Cookie」→ <code>https://x.com</code> を選ぶ</li>
            <li><code>auth_token</code>・<code>ct0</code>・<code>twid</code> の「値」をそれぞれコピーして下に貼る</li>
            <li>「保存して接続テスト」を押す。ログアウトすると Cookie は無効になるので、x.com ではログアウトせずタブを閉じるだけにする</li>
          </ol>
          <p className="muted small">スマホだけの場合：Kiwi Browser など開発者ツールが使える Android ブラウザでも同じ手順で取れます。</p>
        </section>

        <section className="scard">
          <div className="bgroup" style={{ marginBottom: 16 }}>
            <button className={'btn' + (mode === 'cookie' ? ' on' : '')} onClick={() => setMode('cookie')}>Cookie</button>
            <button className={'btn' + (mode === 'key' ? ' on' : '')} onClick={() => setMode('key')}>Rettiwt API キー</button>
          </div>
          {mode === 'cookie' ? <>
            {f('authToken', 'auth_token', '例: 3f9c…（40文字）')}
            {f('ct0', 'ct0', '例: a1b2…（長い英数字）')}
            {f('twid', 'twid（推奨）', '例: u%3D1234567890', 'ブックマーク・いいね一覧・自分のプロフィールに必要です')}
          </> : f('apiKey', 'API キー', 'Rettiwt Auth Helper 拡張機能で取得したキー', 'ブラウザ拡張「X Auth Helper」(rettiwt) で生成した API キーも使えます')}
          <div className="row-flex" style={{ marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn filled lg" onClick={save} disabled={st.busy}><Icon n="key" />{st.busy ? '確認中…' : '保存して接続テスト'}</button>
            {has && <button className="btn outlined lg" onClick={() => { setCreds(null); setC({}); setHas(false); setSt({}); }}><Icon n="logout" />削除（ログアウト）</button>}
          </div>
          {st.ok && <div className="ok-box"><Avatar u={st.ok} /><div><b>{st.ok.name}</b> としてログインしました</div><button className="btn tonal sm" onClick={() => router.push('/')}>ホームへ</button></div>}
          {st.err && <p className="c-err">{st.err}</p>}
        </section>

        <section className="scard">
          <h2>うまく動かないとき</h2>
          <ul className="steps">
            <li>「Cookie の期限切れ」→ x.com で再ログインして Cookie を取り直す</li>
            <li>「レート制限」→ 15 分ほど待つ</li>
            <li>「X に拒否されました」→ サーバー（Vercel）の IP が X にブロックされている可能性。パソコンで <code>npm run dev</code> してローカルで使う（README 参照）</li>
          </ul>
        </section>
      </div>
    </>
  );
}
