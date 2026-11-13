'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { x, getCreds, setCreds, type Creds } from '@/lib/api';
import { Avatar, Header, Icon } from '@/components/ui';
import type { XUser } from '@/lib/types';
import { getGroqKey, setGroqKey, groq } from '@/lib/ai';
import { useMemoOn, setMemoOn } from '@/lib/memo';
import { PRESETS, useSeedPref, setSeedPref } from '@/lib/themeStore';

function AiSettings() {
  const [k, setK] = useState('');
  const [has, setHas] = useState(false);
  const [st, setSt] = useState<{ ok?: boolean; err?: string; busy?: boolean }>({});
  useEffect(() => { const g = getGroqKey(); setK(g); setHas(!!g); }, []);
  const save = async () => {
    const v = k.trim(); if (!v) return;
    setGroqKey(v); setHas(true); setSt({ busy: true });
    try { await groq([{ role: 'user', content: 'ok' }], { max: 1 }); setSt({ ok: true }); }
    catch (e: any) { setSt({ err: e.message }); }
  };
  return (
    <section className="scard" id="ai">
      <h2><span className="ms" style={{ verticalAlign: '-5px', marginRight: 6 }}>auto_awesome</span>AI（Groq Console API キー）</h2>
      <p className="muted small" style={{ marginTop: 0 }}>登録すると「Super Search」、フォロー画面の AI 要約、Keep の「EX Agent」が使えます。キーはこの端末（localStorage）にだけ保存され、リクエストごとに送られるだけでサーバーには保存・記録されません。</p>
      <ol className="steps small">
        <li><a className="lnk" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a> を開いてログイン（無料）</li>
        <li>「Create API Key」→ 名前を付けて作成し、<code>gsk_</code> で始まるキーをコピー</li>
        <li>下に貼って「保存して接続テスト」</li>
      </ol>
      <label className="field" style={{ marginTop: 12 }}><span>Groq API キー</span>
        <input type="password" autoComplete="off" spellCheck={false} value={k} onChange={(e) => setK(e.target.value)} placeholder="gsk_…" /></label>
      <div className="row-flex" style={{ flexWrap: 'wrap' }}>
        <button className="btn filled" onClick={save} disabled={st.busy || !k.trim()}><Icon n="key" />{st.busy ? '確認中…' : '保存して接続テスト'}</button>
        {has && <button className="btn outlined" onClick={() => { setGroqKey(''); setK(''); setHas(false); setSt({}); }}><Icon n="delete" />キーを削除</button>}
      </div>
      {st.ok && <p className="c-primary small"><b>接続できました。</b>Super Search が使えます。</p>}
      {st.err && <p className="c-err small">{st.err}</p>}
    </section>
  );
}

function ThemeSettings() {
  const pref = useSeedPref();
  const custom = pref !== 'system' && !PRESETS.some(([c]) => c === pref);
  return (
    <section className="scard" id="theme">
      <h2><span className="ms" style={{ verticalAlign: '-5px', marginRight: 6 }}>palette</span>テーマカラー</h2>
      <p className="muted small" style={{ marginTop: 0 }}>選んだ色からダイナミックカラー（Material 3）の配色を作ります。ライト／ダークは端末の設定に合わせます。</p>
      <div className="seeds" role="radiogroup" aria-label="テーマカラー">
        <button role="radio" aria-checked={pref === 'system'} className={'seed sys' + (pref === 'system' ? ' on' : '')} onClick={() => setSeedPref('system')} title="システム（端末のアクセントカラー）">
          <Icon n="brightness_auto" /><span>システム</span>
        </button>
        {PRESETS.map(([c, n]) => (
          <button key={c} role="radio" aria-checked={pref === c} className={'seed' + (pref === c ? ' on' : '')} style={{ ['--c' as any]: c }} onClick={() => setSeedPref(c)} title={n} aria-label={n}>
            {pref === c && <Icon n="check" s={20} />}
          </button>
        ))}
        <label className={'seed pick' + (custom ? ' on' : '')} title="カスタム" style={custom ? { ['--c' as any]: pref } : undefined}>
          <Icon n={custom ? 'check' : 'colorize'} s={20} />
          <input type="color" value={custom ? pref : '#1d9bf0'} onChange={(e) => setSeedPref(e.target.value)} aria-label="カスタムカラー" />
        </label>
      </div>
      <div className="swatches" aria-hidden>
        <span style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}>Primary</span>
        <span style={{ background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)' }}>Secondary</span>
        <span style={{ background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)' }}>付箋</span>
        <span style={{ background: 'var(--md-surface-container-highest)', color: 'var(--md-on-surface)' }}>Surface</span>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>「システム」は端末のアクセントカラーを使います（ブラウザが対応していない場合はブルー）。</p>
    </section>
  );
}

function MemoSettings() {
  const on = useMemoOn();
  return (
    <section className="scard" id="memo">
      <label className="sw-row">
        <div><h2 style={{ margin: 0 }}>Keep パネル</h2><p className="muted small" style={{ margin: '4px 0 0' }}>右サイドバーの「日本のトレンド」を「Keep ／ EX Agent」パネルに置き換え、ポストや画像をドラッグして Keep・ノート・Agent に追加できるようにします。Keep 画面は左メニューの「Keep」からいつでも開けます。データはこの端末にだけ保存されます。</p></div>
        <input type="checkbox" className="switch" role="switch" checked={on} onChange={(e) => setMemoOn(e.target.checked)} aria-label="Keep パネル" />
      </label>
    </section>
  );
}

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
          <Icon n="warning" /><div><b>注意</b><p>EX は X の非公式（内部）API を使います。X の利用規約に反するため、アカウントが凍結・制限される可能性があります。<b>必ずサブアカウントで</b>使ってください。Cookie はこの端末のブラウザ（localStorage）にだけ保存され、サーバーには保存・記録されません。</p></div>
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

        <ThemeSettings />
        <AiSettings />
        <MemoSettings />

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
