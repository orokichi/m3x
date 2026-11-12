# M3X

Material 3 Expressive デザインの X (Twitter) クライアント。Next.js 15 + [rettiwt-api](https://github.com/Rishikant181/Rettiwt-API)（X の内部 API）。

> ⚠️ 非公式 API を使うため X の利用規約違反です。アカウント凍結の可能性があるので **サブアカウント** で使ってください。X Corp. とは無関係です。

## 使い方

1. PC のブラウザで x.com にサブアカウントでログイン
2. F12 → Application → Cookies → `https://x.com` から `auth_token` / `ct0` / `twid` の値をコピー
3. M3X の「設定」画面に貼って「保存して接続テスト」

Cookie はブラウザの localStorage にだけ保存され、リクエストごとにヘッダーで送られます（サーバーには保存・記録しません）。

## 機能

おすすめ / フォロー中タイムライン（無限スクロール）、ポスト詳細と返信スレッド、投稿（テキスト + 画像4枚）、返信・引用、いいね・リポスト・ブックマーク・共有、プロフィール（ポスト/返信/メディア/いいね）、フォロー/解除、フォロー・フォロワー一覧、検索（話題/最新/ユーザー/メディア）、通知、ブックマーク、リスト、日本のトレンド。ライト/ダークはシステム設定に追従。

ログインなしでも、プロフィール・ユーザーのポスト・ポスト詳細・トレンドは見られます。

## ローカルで動かす（Vercel が X にブロックされたとき）

Vercel などのデータセンター IP は X にブロック/制限されることがあります。その場合は自分の PC で:

```bash
git clone https://github.com/orokichi/m3x.git
cd m3x
npm install
npm run dev   # → http://localhost:3000
```

## エラー

- 「Cookie の期限切れ」: x.com で再ログインして Cookie を取り直す
- 「レート制限」: 15 分ほど待つ
- 「X に拒否されました」: 上のローカル実行を試す
