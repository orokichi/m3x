/* Pure (no React / DOM) planner pieces for Agent Actions mode, so they can be
   unit-tested: the snapshot type, the request builder and the validator.
   A request contains ONLY the current screen snapshot, the goal, this run's
   own step log and the user's answers — never chat history, Agent context
   posts or Keep contents. */

export interface AxEl { id: string; label: string; risk?: boolean; input?: boolean }
export interface AxPost { id: string; text: string }
export interface AxFolder { id: string; name: string }
export interface AxSnap { route: string; els: AxEl[]; posts: AxPost[]; folders: AxFolder[] }

export type AxAction =
  | { type: 'navigate'; route: string }
  | { type: 'click'; id: string }
  | { type: 'scroll'; dir: 'up' | 'down' }
  | { type: 'type'; id: string; text: string; submit: boolean }
  | { type: 'open_post'; id: string }
  | { type: 'drag_to_keep'; postId: string; folderId: string }
  | { type: 'add_context'; postId: string }
  | { type: 'ask_user'; question: string; choices: string[] }
  | { type: 'done'; message: string };

export type AxChat = { role: 'system' | 'user'; content: string };

export const AX_MAX_STEPS = 12;

/** Explicit save instruction (drag_to_keep is allowed only then). */
export const SAVE_INTENT = /(keep|キープ|保存|しまって|入れて|ブックマーク|フォルダ(に|へ))/i;
export const wantsSave = (t: string) => SAVE_INTENT.test(t || '');

const ROUTES = ['/', '/explore', '/notifications', '/super-search', '/keep', '/following', '/lists', '/settings'];
export function okRoute(r: string) {
  if (typeof r !== 'string' || !r.startsWith('/') || r.length > 160 || r.startsWith('//')) return false;
  return ROUTES.includes(r) || /^\/(search\?q=.+|status\/\d+|u\/[A-Za-z0-9_]{1,15}(\/(followers|following|likes|media))?|lists\/\d+)$/.test(r);
}

export const AX_SYS = `あなたはXクライアント「EX」の画面操作エージェント。仮想マウス「EX Mouse」で画面を1手ずつ操作してユーザーの目的を達成する。
毎回、現在の画面のスナップショットが渡される。次の1手だけを、次のJSONだけで返す:
{"thought":"短い考え(30字以内)","action":{...}}
action の種類:
{"type":"navigate","route":"/explore"}  主要ルート: / /explore /notifications /keep /following /lists /settings /search?q=語 /status/ポストID /u/ハンドル
{"type":"click","id":"要素ID"}
{"type":"scroll","dir":"down"}  (down か up)
{"type":"type","id":"入力欄の要素ID","text":"入力文字","submit":true}
{"type":"open_post","id":"ポストID"}
{"type":"drag_to_keep","postId":"ポストID","folderId":"フォルダID"}  ユーザーが保存を明示的に頼んだときだけ
{"type":"add_context","postId":"ポストID"}  ポストを Agent のコンテキストに追加
{"type":"ask_user","question":"質問","choices":["選択肢1","選択肢2"]}  情報が足りない・判断に迷うときだけ
{"type":"done","message":"結果の短い報告"}
規則:
- id / postId / folderId はスナップショットにあるものだけを使う。作らない。
- 目的を達成したら、またはできないと分かったら done。
- いいね・リポスト・返信・投稿・フォロー・ブックマークはユーザーが頼んだときだけ。
- 目的の要素が見当たらなければ scroll か navigate で探す。同じ失敗を繰り返さない。`;

const cut = (s: string, n: number) => { const a = Array.from(String(s || '').replace(/https?:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim()); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };

export function snapText(s: AxSnap) {
  const els = s.els.map((e) => `${e.id} : ${cut(e.label, 50)}${e.input ? ' [入力欄]' : ''}${e.risk ? ' [要確認]' : ''}`).join('\n');
  const posts = s.posts.map((p) => `${p.id} : ${cut(p.text, 80)}`).join('\n');
  const fs = s.folders.map((f) => `${f.id} : ${cut(f.name, 30)}`).join('\n');
  return `[ルート] ${s.route}\n[操作可能要素 (id : 内容)]\n${els || 'なし'}\n[表示中のポスト (ポストID : 本文)]\n${posts || 'なし'}\n[Keepフォルダ (folderId : 名前)]\n${fs || 'なし'}`;
}

/** Build the request: system prompt + ONE user message with current data only. */
export function buildAxRequest(o: { goal: string; snap: AxSnap; log: string[] }): AxChat[] {
  const log = o.log.slice(-10).join('\n');
  return [
    { role: 'system', content: AX_SYS },
    { role: 'user', content: `[目的] ${cut(o.goal, 400)}\n[これまでの手順]\n${log || 'なし'}\n${snapText(o.snap)}\n次の1手をJSONで。` },
  ];
}

/** Validate a model reply against the snapshot. Returns the action or a reason it was rejected. */
export function validateAx(raw: any, s: AxSnap, saveOk: boolean): { action?: AxAction; thought: string; error?: string } {
  const thought = cut(raw?.thought || '', 60);
  const a = raw?.action && typeof raw.action === 'object' ? raw.action : raw;
  const t = String(a?.type || '');
  const str = (v: any) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const elIds = new Set(s.els.map((e) => e.id));
  const postIds = new Set(s.posts.map((p) => p.id));
  const fIds = new Set(s.folders.map((f) => f.id));
  const bad = (error: string) => ({ thought, error });
  switch (t) {
    case 'navigate': { const r = str(a.route || a.path); return okRoute(r) ? { thought, action: { type: t, route: r } } : bad(`ルート ${r || '(空)'} は使えない`); }
    case 'click': { const id = str(a.id); return elIds.has(id) ? { thought, action: { type: t, id } } : bad(`要素 ${id || '(空)'} は画面に無い`); }
    case 'scroll': return { thought, action: { type: t, dir: str(a.dir) === 'up' ? 'up' : 'down' } };
    case 'type': {
      const id = str(a.id); const text = str(a.text).slice(0, 280);
      const el = s.els.find((e) => e.id === id);
      if (!el || !el.input) return bad(`入力欄 ${id || '(空)'} は画面に無い`);
      if (!text) return bad('入力文字が空');
      return { thought, action: { type: t, id, text, submit: a.submit !== false } };
    }
    case 'open_post': { const id = str(a.id || a.postId); return postIds.has(id) ? { thought, action: { type: t, id } } : bad(`ポスト ${id || '(空)'} は画面に無い`); }
    case 'add_context': { const id = str(a.postId || a.id); return postIds.has(id) ? { thought, action: { type: t, postId: id } } : bad(`ポスト ${id || '(空)'} は画面に無い`); }
    case 'drag_to_keep': {
      if (!saveOk) return bad('ユーザーは保存を頼んでいないので drag_to_keep は禁止');
      const postId = str(a.postId || a.id); const folderId = str(a.folderId) || 'keep';
      if (!postIds.has(postId)) return bad(`ポスト ${postId || '(空)'} は画面に無い`);
      if (!fIds.has(folderId)) return bad(`フォルダ ${folderId} は無い`);
      return { thought, action: { type: t, postId, folderId } };
    }
    case 'ask_user': {
      const question = cut(str(a.question), 200);
      if (!question) return bad('質問が空');
      const choices = (Array.isArray(a.choices) ? a.choices : Array.isArray(a.options) ? a.options : []).map(str).filter(Boolean).slice(0, 5).map((c: string) => cut(c, 40));
      return { thought, action: { type: t, question, choices } };
    }
    case 'done': return { thought, action: { type: t, message: cut(str(a.message) || '完了しました', 300) } };
    default: return bad(`不明なアクション ${t || '(空)'}`);
  }
}

/** Short Japanese description of an action for the step log. */
export function describeAx(a: AxAction, s: AxSnap): string {
  const L = (id: string) => cut(s.els.find((e) => e.id === id)?.label || id, 28);
  const P = (id: string) => cut(s.posts.find((p) => p.id === id)?.text || id, 22);
  const F = (id: string) => s.folders.find((f) => f.id === id)?.name || id;
  switch (a.type) {
    case 'navigate': return `${a.route} へ移動`;
    case 'click': return `「${L(a.id)}」をクリック`;
    case 'scroll': return a.dir === 'down' ? '下へスクロール' : '上へスクロール';
    case 'type': return `「${L(a.id)}」に「${cut(a.text, 20)}」と入力`;
    case 'open_post': return `ポスト「${P(a.id)}」を開く`;
    case 'drag_to_keep': return `ポスト「${P(a.postId)}」を「${F(a.folderId)}」へドラッグ`;
    case 'add_context': return `ポスト「${P(a.postId)}」をコンテキストに追加`;
    case 'ask_user': return `質問: ${a.question}`;
    case 'done': return a.message;
  }
}
