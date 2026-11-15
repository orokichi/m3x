// Unit tests for lib/aiPrompts.ts with a mocked Groq call (no network, no key).
// Run: node scripts/test-ai.mjs
import ts from 'typescript'; import fs from 'node:fs'; import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../lib/aiPrompts.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import('data:text/javascript,' + encodeURIComponent(js));
const P = { id: '1', handle: 'alice', name: 'Alice', text: 'Hello world https://t.co/abc', likes: 3, media: 0 };

// per-post jobs: tiers, keys, never an X action instruction
const kinds = m.POST_KINDS.map((k) => k[0]);
assert.deepEqual(kinds, ['summary', 'translate', 'explain', 'factcheck', 'reply']);
for (const k of kinds) {
  const j = m.postJob(k, P);
  assert.ok(j.key.includes(k) && j.key.includes(':1:'), 'key per kind+post');
  assert.equal(j.tier, k === 'explain' || k === 'factcheck' ? 'large' : 'small');
  assert.ok(!j.messages[1].content.includes('t.co'), 't.co links stripped');
}
assert.notEqual(m.postJob('summary', P).key, m.postJob('summary', { ...P, text: 'edited' }).key, 'content change → new key');
assert.equal(m.postJob('reply', P).json, true);

// parsers
assert.deepEqual(m.parseDrafts('{"drafts":["a案です","b案です","c案です","d"]}'), ['a案です', 'b案です', 'c案です']);
assert.deepEqual(m.parseDrafts('1. 一つ目\n2. 二つ目'), ['一つ目', '二つ目']);
assert.deepEqual(m.parseTags('{"tags":["テスト","#AI","#AI"]}'), ['#テスト', '#AI']);
assert.deepEqual(m.parseNext('{"next":["a","b","c","d"]}'), ['a', 'b', 'c']);
assert.equal(m.cleanRewrite('修正後：「こんにちは」'), 'こんにちは');
const g = m.parseGroups('{"groups":[{"name":"料理","items":["K1","K2","K9"]},{"name":"Keep","items":["K3"]},{"name":"AI","items":["K2","K3"]}]}', 3);
assert.deepEqual(g, [{ name: '料理', idx: [0, 1] }, { name: 'AI', idx: [2] }], 'groups: valid ids only, no dupes, no "Keep"');

// cache with mocked Groq: one call per key, in-flight dedupe, force refresh, storage reuse
const store = new Map(); const S = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
let calls = 0; const mock = async (j) => { calls++; await new Promise((r) => setTimeout(r, 5)); return `out:${j.key}:${calls}`; };
const c = m.makeCache(S);
const job = m.postJob('summary', P);
const [a, b] = await Promise.all([c.run(job, mock), c.run(job, mock)]);
assert.equal(calls, 1); assert.equal(a, b);
assert.equal(await c.run(job, mock), a); assert.equal(calls, 1, 'cached');
const c2 = m.makeCache(S); assert.equal(await c2.run(job, mock), a); assert.equal(calls, 1, 'sessionStorage reuse');
await c.run(job, mock, true); assert.equal(calls, 2, 'force refresh');
const failing = m.makeCache(S); await assert.rejects(failing.run(m.postJob('translate', P), async () => { throw new Error('no key'); }));
assert.equal(failing.get(m.postJob('translate', P).key), undefined, 'errors are not cached');

// visible context: fresh, on-screen only, max 7, ordered
const cards = Array.from({ length: 12 }, (_, i) => ({ src: { id: 'p' + i }, top: i * 100 - 150, bottom: i * 100 - 50, left: 0 }));
const v = m.pickVisible(cards, 800);
assert.equal(v.length, 7); assert.equal(v[0].id, 'p2'); assert.ok(!v.some((s) => s.id === 'p0' || s.id === 'p1'), 'scrolled-off / under sticky header excluded');
assert.equal(m.pickVisible([...cards, { src: { id: 'p3' }, top: 10, bottom: 90, left: 400 }], 800).filter((s) => s.id === 'p3').length, 1, 'dedupe');

// other jobs
assert.equal(m.trendJob('X', []).messages[0].content.includes('推測'), true, 'no posts → flagged as guess');
assert.ok(m.digestJob('/', [P]).key.startsWith('digest:'));
assert.ok(m.threadJob(P, [], []).messages[1].content.includes('[返信] なし'));
assert.equal(m.composeJob('tags', 'テスト').json, true);
assert.ok(m.keepAskJob('質問', [{ id: 'k', handle: 'a', text: 't' }]).messages[0].content.includes('操作はしない'));
console.log('ai tests: all passed');
