// Proves a removed context item's text never reaches the /api/ai payload.
// Run: node scripts/test-agent-context.mjs
import ts from 'typescript'; import fs from 'node:fs'; import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../lib/agentPrompt.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import('data:text/javascript,' + encodeURIComponent(js));
const SECRET = 'ZEBRA_SECRET_ペンギン42';
const A = { id: 'a', handle: 'alice', text: `秘密の内容 ${SECRET}` }, B = { id: 'b', handle: 'bob', text: '天気の話' };
const keepA = { id: 'ka', src: A }, keepB = { id: 'kb', src: { id: 'x', handle: 'carol', text: 'ラーメン' } };
const folders = [{ name: 'Keep', items: [keepA, keepB], notes: [] }];
// Turn 1: A and B in context, reply quoted A.
const r1 = m.buildAgentRequest({ sys: 'S', msgs: [], ctx: [A, B], keep: [keepA, keepB], folders, text: '要約して' });
assert.ok(JSON.stringify(r1.messages).includes(SECRET), 'sanity: A sent while present');
assert.equal(r1.keepOn, false); assert.ok(!JSON.stringify(r1.messages).includes('ラーメン'), 'Keep not sent without instruction');
const msgs = [{ role: 'user', text: '要約して', ctxIds: r1.ctxIds, keepIds: [] }, { role: 'assistant', text: `[C1] によると ${SECRET} です`, ctxIds: r1.ctxIds, keepIds: [] }];
// Remove A (context chip) -> next question.
const r2 = m.buildAgentRequest({ sys: 'S', msgs, ctx: [B], keep: [keepA, keepB], folders, text: 'さっきの内容は？' });
const p2 = JSON.stringify({ tier: 'small', messages: r2.messages });
assert.ok(!p2.includes(SECRET), 'removed context text absent (incl. history)');
assert.ok(!p2.includes('alice'), 'removed handle absent');
// A remains in Keep, but Keep is only sent on explicit instruction; removing the Keep item too:
const r3 = m.buildAgentRequest({ sys: 'S', msgs, ctx: [B], keep: [keepB], folders, text: 'Keep を整理して' });
assert.equal(r3.keepOn, true); assert.ok(!JSON.stringify(r3.messages).includes(SECRET), 'removed Keep item absent');
// History survives when nothing it used was removed, with refs stripped.
const r4 = m.buildAgentRequest({ sys: 'S', msgs, ctx: [A, B], keep: [], folders, text: '続けて' });
assert.equal(r4.messages.length, 4); assert.ok(!r4.messages[2].content.includes('C1'));
// Keep intent
for (const t of ['Keep を整理して', 'ノートを作って', '保存して', 'フォルダに移動']) assert.ok(m.wantsKeep(t), t);
for (const t of ['要約して', 'これは何？', '内容をまとめて']) assert.ok(!m.wantsKeep(t), t);
console.log('agent context tests: all passed');
