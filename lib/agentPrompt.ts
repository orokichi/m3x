/* Pure request builder for the Agent (no React, no storage) so it can be
   unit-tested: every request is built ONLY from the context and Keep data
   passed in at send time. */

export interface PSrc { id: string; handle: string; text: string }
export interface PItem { id: string; src: PSrc; media?: { type: string } }
export interface PFolder { name: string; items?: unknown[]; notes: unknown[] }
export interface PMsg { role: 'user' | 'assistant'; text?: string; err?: boolean; note?: boolean; pending?: boolean; ctxIds?: string[]; keepIds?: string[] }
export type PChat = { role: 'system' | 'user' | 'assistant'; content: string };

/** True only when the user explicitly asks to save / organize / create
    folders or notes. Keep data is sent and Keep actions are honoured only then. */
export const KEEP_INTENT = /(keep|キープ|保存|整理|仕分|分類|振り分|フォルダ|ノート|メモ(を|に|して|作)|移動|移して|入れて|しまって|片付|まとめて(保存|入れ|ノート|フォルダ))/i;
export const wantsKeep = (t: string) => KEEP_INTENT.test(t || '');

const cut = (s: string, n: number) => { const a = Array.from(s.replace(/https?:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim()); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
/** Remove [C1] / K2 style references: numbering shifts after removals. */
export const stripRefs = (s: string) => s.replace(/[\[［(（]?\b[CK]\d+\b[\]］)）]?/g, '').replace(/[ \t]{2,}/g, ' ').trim();

export function buildContext(folders: PFolder[], keep: PItem[] | null, ctx: PSrc[]) {
  const c = ctx.map((s, n) => `C${n + 1} @${s.handle}: ${cut(s.text, 240)}`).join('\n');
  if (!keep) return `[コンテキスト]\n${c || 'なし'}`;
  const f = folders.slice(0, 30).map((x) => `${x.name}(保存${x.items?.length || 0}/ノート${x.notes.length})`).join(', ');
  const k = keep.slice(0, 40).map((i, n) => `K${n + 1} ${i.media ? (i.media.type === 'photo' ? '画像' : i.media.type === 'gif' ? 'GIF' : '動画') : 'ポスト'} @${i.src.handle}: ${cut(i.src.text, 70)}`).join('\n');
  return `[フォルダ] ${f || 'なし'}\n[Keep]\n${k || 'なし'}\n[コンテキスト]\n${c || 'なし'}`;
}

/** History safe to resend: drops every turn that was built from a context
    post or Keep item that is no longer present, and strips C#/K# refs. */
export function safeHistory(msgs: PMsg[], ctxIds: string[], keepIds: string[], from = 0): PChat[] {
  const cs = new Set(ctxIds), ks = new Set(keepIds);
  return msgs.slice(from)
    .filter((m) => m.text && !m.err && !m.note && !m.pending)
    .filter((m) => Array.isArray(m.ctxIds) && m.ctxIds.every((id) => cs.has(id)) && (m.keepIds || []).every((id) => ks.has(id)))
    .slice(-4)
    .map((m) => ({ role: m.role, content: cut(stripRefs(m.text!), 300) }))
    .filter((m) => m.content);
}

export function buildAgentRequest(o: { sys: string; msgs: PMsg[]; ctx: PSrc[]; keep: PItem[]; folders: PFolder[]; text: string; from?: number }) {
  const keepOn = wantsKeep(o.text);
  const keepSent = keepOn ? o.keep.slice(0, 40) : null;
  const ctxIds = o.ctx.map((s) => s.id);
  const keepIds = keepSent ? keepSent.map((i) => i.id) : [];
  const hist = safeHistory(o.msgs, ctxIds, o.keep.map((i) => i.id), o.from || 0);
  const messages: PChat[] = [{ role: 'system', content: o.sys }, ...hist, { role: 'user', content: `${buildContext(o.folders, keepSent, o.ctx)}\n[依頼] ${o.text}` }];
  return { messages, keepOn, ctxIds, keepIds, keepSent: keepSent || [] };
}
