/* Pure prompt builders + result parsers for Xplore's Groq features (no React,
   no storage, no fetch) so they can be unit-tested with a mocked Groq call.
   Nothing here ever performs an X action: outputs are text / drafts / suggestions only. */

export type Tier = 'small' | 'large';
export type Chat = { role: 'system' | 'user' | 'assistant'; content: string };
export interface Job { key: string; tier: Tier; max: number; json?: boolean; temperature?: number; messages: Chat[] }
export interface LitePost { id: string; handle: string; name?: string; text: string; at?: string; likes?: number; media?: number }

const clean = (s: string) => (s || '').replace(/https?:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim();
export const cut = (s: string, n: number) => { const a = Array.from(clean(s)); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
/** Small, stable hash for cache keys (content changes → new key). */
export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export const list = (ps: LitePost[], cap: number, len: number) => ps.slice(0, cap).map((p, i) => `[${i + 1}] @${p.handle}${p.at ? ' ' + p.at.slice(5, 10).replace('-', '/') : ''}: ${cut(p.text, len)}${p.media ? ' [画像]' : ''}${p.likes ? ' ♥' + p.likes : ''}`).join('\n');

const NO_ACT = '投稿・いいね・フォロー等の操作はしない。';

/* ---------- per-post ---------- */
export type PostKind = 'summary' | 'translate' | 'explain' | 'factcheck' | 'reply';
export const POST_KINDS: [PostKind, string, string][] = [
  ['summary', '要約', 'summarize'],
  ['translate', '日本語に翻訳', 'translate'],
  ['explain', '解説・背景', 'lightbulb'],
  ['factcheck', 'ファクトチェック観点', 'fact_check'],
  ['reply', '返信案', 'edit_note'],
];
const POST_SYS: Record<PostKind, string> = {
  summary: '与えられたXのポストを日本語で1〜3行に要約する。前置きなし。',
  translate: '与えられたXのポストを自然な日本語に翻訳する。既に日本語なら「すでに日本語です」とだけ返し、続けて1行で要約。訳文のみ、注釈なし。',
  explain: 'Xのポストの読み手向けに、日本語で背景・前提知識・用語を簡潔に解説する(最大5行、箇条書き可)。確実でないことは「〜の可能性」と明示し、断定しない。',
  factcheck: 'Xのポストについて、日本語で「確認すべき主張」と「確かめ方(一次情報・公式発表・日付・出典など)」を箇条書きで挙げる(最大5項目)。真偽を断定せず、判断材料の観点だけを示す。',
  reply: `Xのポストへの返信案を日本語で3つ作る。次のJSONだけを返す: {"drafts":["案1","案2","案3"]}。各140字以内、丁寧/カジュアル/質問 の異なるトーン。誹謗中傷や断定的な事実主張は避ける。${NO_ACT}`,
};
export function postJob(kind: PostKind, p: LitePost & { quoted?: LitePost }): Job {
  const body = `@${p.handle}${p.name ? `（${p.name}）` : ''}: ${cut(p.text, 900)}${p.quoted ? `\n[引用元] @${p.quoted.handle}: ${cut(p.quoted.text, 400)}` : ''}${p.media ? '\n[画像/動画あり]' : ''}`;
  const large = kind === 'explain' || kind === 'factcheck';
  return { key: `post:${kind}:${p.id}:${hash(body)}`, tier: large ? 'large' : 'small', max: kind === 'reply' ? 420 : large ? 420 : 260, json: kind === 'reply', temperature: kind === 'reply' ? 0.7 : 0.2,
    messages: [{ role: 'system', content: POST_SYS[kind] }, { role: 'user', content: body }] };
}
export function parseDrafts(out: string): string[] {
  const j = parseJson<{ drafts?: unknown }>(out);
  const d = Array.isArray(j?.drafts) ? j!.drafts : out.split('\n').map((l) => l.replace(/^\s*(\d+[.)．、]|[-・*])\s*/, ''));
  return d.map((x) => String(x || '').trim()).filter((x) => x && x.length > 1).map((x) => Array.from(x).slice(0, 280).join('')).slice(0, 3);
}

/* ---------- feeds / threads / trends / profile ---------- */
export function digestJob(scope: string, ps: LitePost[]): Job {
  const l = list(ps, 30, 120);
  return { key: `digest:${scope}:${hash(l)}`, tier: 'large', max: 480, temperature: 0.2, messages: [
    { role: 'system', content: 'Xのタイムラインのポスト一覧だけを根拠に、日本語で「ここまでの要約」を作る。話題ごとに箇条書き(最大6項目)、各項目の末尾に根拠を [番号] で示す。最初に1行の総括。一覧にない情報は書かない。' },
    { role: 'user', content: l }] };
}
export function threadJob(main: LitePost, parents: LitePost[], replies: LitePost[]): Job {
  const ctx = `${parents.length ? `[スレッドの前のポスト]\n${parents.slice(-6).map((p) => `@${p.handle}: ${cut(p.text, 200)}`).join('\n')}\n` : ''}[本文] @${main.handle}: ${cut(main.text, 500)}\n${replies.length ? `[返信]\n${list(replies, 25, 110)}` : '[返信] なし'}`;
  return { key: `thread:${main.id}:${hash(ctx)}`, tier: 'large', max: 460, temperature: 0.2, messages: [
    { role: 'system', content: 'Xのポストとそのスレッド・返信だけを根拠に日本語で要約する。形式: 1行目に本文の要点、次に「返信の傾向」(賛成/反対/質問/補足など)を箇条書きで最大5項目、返信の根拠は [番号]。返信がなければスレッドの流れだけを要約。推測しない。' },
    { role: 'user', content: ctx }] };
}
export function trendJob(name: string, ps: LitePost[]): Job {
  const l = ps.length ? list(ps, 15, 100) : '';
  return { key: `trend:${name}:${hash(l)}`, tier: 'small', max: 220, temperature: 0.2, messages: [
    { role: 'system', content: ps.length
      ? 'Xのトレンドワードと関連ポストから「なぜ話題か」を日本語2〜3文で説明する。ポストにない事実は書かない。根拠は [番号]。'
      : 'Xのトレンドワードについて、関連ポストは取得できなかった。考えられる理由を日本語2文以内で述べ、最初に「（ポスト未取得のため推測）」と書く。断定しない。' },
    { role: 'user', content: `トレンド: ${name}${l ? `\n${l}` : ''}` }] };
}
export function profileJob(u: { handle: string; name: string; bio?: string }, ps: LitePost[]): Job {
  const l = list(ps, 25, 110);
  return { key: `profile:${u.handle.toLowerCase()}:${hash(l)}`, tier: 'large', max: 420, temperature: 0.2, messages: [
    { role: 'system', content: 'Xユーザーの最近のポストだけを根拠に日本語でプロフィール分析を書く。形式: 「概要:」1〜2文 / 「よく話す話題:」箇条書き最大4(根拠 [番号]) / 「最近のトピック:」1〜2文。人格の評価や推測による個人情報は書かない。' },
    { role: 'user', content: `@${u.handle}（${u.name}）${u.bio ? `\n自己紹介: ${cut(u.bio, 160)}` : ''}\n${l || 'ポストなし'}` }] };
}
/** Search: suggested follow-up queries. */
export function followUpsJob(q: string, tldr: string): Job {
  return { key: `fu:${hash(q + tldr)}`, tier: 'small', max: 160, json: true, temperature: 0.4, messages: [
    { role: 'system', content: 'X検索の要望と結果の要約から、次に試すと良い検索の要望文を日本語で3つ提案する。次のJSONだけ: {"next":["…","…","…"]} 各25字以内、元の要望と重複しない。' },
    { role: 'user', content: `要望: ${q}\n要約: ${cut(tldr, 300)}` }] };
}
export const parseNext = (out: string) => { const j = parseJson<{ next?: unknown }>(out); return (Array.isArray(j?.next) ? j!.next : []).map((s) => cut(String(s || ''), 40)).filter(Boolean).slice(0, 3); };

/* ---------- compose ---------- */
export type ComposeKind = 'proof' | 'polite' | 'casual' | 'concise' | 'fit140' | 'fit280' | 'tags';
export const COMPOSE: [ComposeKind, string][] = [['proof', '校正'], ['polite', '丁寧に'], ['casual', 'カジュアルに'], ['concise', '簡潔に'], ['fit140', '140字に'], ['fit280', '280字に'], ['tags', '#タグ提案']];
const COMPOSE_SYS: Record<ComposeKind, string> = {
  proof: '日本語の文章の誤字脱字・文法・表記ゆれを直す。意味と口調は変えない。修正後の本文だけを返す。',
  polite: '文章の意味を保ったまま丁寧な口調に書き換える。本文だけを返す。',
  casual: '文章の意味を保ったまま親しみやすいカジュアルな口調に書き換える。本文だけを返す。',
  concise: '文章の意味を保ったまま、より短く簡潔に書き換える。本文だけを返す。',
  fit140: '文章の要点を保ち、140文字以内に収める。本文だけを返す。',
  fit280: '文章の要点を保ち、280文字以内に収める(短い場合は自然に補ってよいが事実を足さない)。本文だけを返す。',
  tags: 'Xの投稿文に合うハッシュタグを最大5個提案する。次のJSONだけ: {"tags":["#…"]} 実在しそうな一般的なものを優先。',
};
export function composeJob(kind: ComposeKind, text: string, reply?: LitePost): Job {
  const body = `${reply ? `[返信先] @${reply.handle}: ${cut(reply.text, 200)}\n` : ''}[本文]\n${Array.from(text).slice(0, 1200).join('')}`;
  return { key: `compose:${kind}:${hash(body)}`, tier: 'small', max: kind === 'tags' ? 120 : 520, json: kind === 'tags', temperature: kind === 'tags' ? 0.4 : 0.3,
    messages: [{ role: 'system', content: COMPOSE_SYS[kind] + ' ' + NO_ACT }, { role: 'user', content: body }] };
}
export const parseTags = (out: string) => {
  const j = parseJson<{ tags?: unknown }>(out);
  const raw = Array.isArray(j?.tags) ? j!.tags.map(String) : out.match(/[#＃][^\s#＃,、]+/g) || [];
  return [...new Set(raw.map((t) => '#' + t.trim().replace(/^[#＃]+/, '').replace(/[\s,、。]+/g, '')).filter((t) => t.length > 1))].slice(0, 5);
};
/** Model output → plain composer text (strip quotes / labels the model sometimes adds). */
export const cleanRewrite = (s: string) => s.trim().replace(/^```\w*\n?|```$/g, '').replace(/^(修正後|本文|書き換え)[:：]\s*/, '').replace(/^「([\s\S]*)」$/, '$1').trim();

/* ---------- Keep ---------- */
export interface KeepLite { id: string; handle: string; text: string; media?: string }
export function keepAskJob(q: string, items: KeepLite[]): Job {
  const l = items.slice(0, 40).map((i, n) => `[${n + 1}] ${i.media ? `(${i.media}) ` : ''}@${i.handle}: ${cut(i.text, 110)}`).join('\n');
  return { key: `keepask:${hash(q + l)}`, tier: 'large', max: 420, temperature: 0.2, messages: [
    { role: 'system', content: 'ユーザーがKeepに保存したXのポスト一覧だけを根拠に、質問へ日本語で簡潔に答える(最大6行)。根拠は [番号]。一覧にないことは「Keepには見当たりません」と答える。保存・整理などの操作はしない。' },
    { role: 'user', content: `[Keep]\n${l || 'なし'}\n[質問] ${q}` }] };
}
export function keepTagsJob(items: KeepLite[], folders: string[]): Job {
  const l = items.slice(0, 40).map((i, n) => `K${n + 1} @${i.handle}: ${cut(i.text, 70)}`).join('\n');
  return { key: `keeptags:${hash(l + folders.join())}`, tier: 'small', max: 420, json: true, temperature: 0.2, messages: [
    { role: 'system', content: `Keepのアイテムを内容で2〜6個のグループ(短い日本語のフォルダ名)に分ける提案をする。既存フォルダ名があれば再利用。次のJSONだけ: {"groups":[{"name":"フォルダ名","items":["K1","K3"]}]}。分類に迷うものは入れない。提案のみで実行はしない。` },
    { role: 'user', content: `[既存フォルダ] ${folders.join(', ') || 'なし'}\n${l}` }] };
}
export function parseGroups(out: string, n: number) {
  const j = parseJson<{ groups?: any[] }>(out);
  const used = new Set<number>();
  return (Array.isArray(j?.groups) ? j!.groups : []).filter((g) => { const nm = String(g?.name || '').trim().toLowerCase(); return nm && nm !== 'keep'; }).map((g) => {
    const name = cut(String(g?.name || ''), 20);
    const idx = (Array.isArray(g?.items) ? g.items : []).map((s: any) => { const m = String(s).match(/^K?(\d+)$/i); return m ? +m[1] - 1 : -1; })
      .filter((i: number) => i >= 0 && i < n && !used.has(i) && !!used.add(i));
    return { name, idx: idx as number[] };
  }).filter((g) => g.name && g.name.toLowerCase() !== 'keep' && g.idx.length).slice(0, 6);
}

/* ---------- shared ---------- */
export function parseJson<T = any>(t: string): T | null {
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  const m = (t || '').match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return null;
}

/** Cache: memory Map + optional Storage (sessionStorage), with in-flight dedupe. */
export function makeCache(store?: Pick<Storage, 'getItem' | 'setItem'> | null, prefix = 'm3x.ai.') {
  const mem = new Map<string, string>(), fly = new Map<string, Promise<string>>();
  const get = (k: string) => { if (mem.has(k)) return mem.get(k)!; try { const v = store?.getItem(prefix + hash(k) + k.length); if (v != null) { mem.set(k, v); return v; } } catch { /* ignore */ } return undefined; };
  const set = (k: string, v: string) => { mem.set(k, v); try { store?.setItem(prefix + hash(k) + k.length, v); } catch { /* quota */ } };
  return {
    get,
    async run(job: Job, call: (j: Job) => Promise<string>, force = false): Promise<string> {
      if (!force) { const hit = get(job.key); if (hit !== undefined) return hit; const f = fly.get(job.key); if (f) return f; }
      const p = call(job).then((v) => { set(job.key, v); return v; }).finally(() => fly.delete(job.key));
      fly.set(job.key, p); return p;
    },
  };
}

/** Pick the posts currently on screen (fresh, max 7), top-to-bottom then left-to-right. */
export function pickVisible<T extends { id: string }>(cards: { src: T; top: number; bottom: number; left: number }[], vh: number, max = 7): T[] {
  const seen = new Set<string>();
  return cards
    .filter((c) => c.bottom > 56 && c.top < vh - 24 && c.bottom - c.top > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .filter((c) => !seen.has(c.src.id) && !!seen.add(c.src.id))
    .slice(0, max).map((c) => c.src);
}
