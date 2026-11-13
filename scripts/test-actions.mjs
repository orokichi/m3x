// Agent Actions planner tests: id validation, save gating, request contents.
// Run: node scripts/test-actions.mjs
import ts from 'typescript'; import fs from 'node:fs'; import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../lib/axPlan.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import('data:text/javascript,' + encodeURIComponent(js));
const snap = { route: '/', els: [{ id: 'nav:/explore', label: 'ナビ「話題を検索」' }, { id: 'search', label: '検索ボックス', input: true }, { id: 'like:1', label: 'いいね', risk: true }],
  posts: [{ id: '1', text: '@a: hello' }], folders: [{ id: 'keep', name: 'Keep' }] };
const ok = (raw, save = false) => m.validateAx(raw, snap, save);
assert.equal(ok({ action: { type: 'click', id: 'nav:/explore' } }).action.type, 'click');
assert.ok(ok({ action: { type: 'click', id: 'nav:/ghost' } }).error, 'unknown id rejected');
assert.ok(ok({ action: { type: 'type', id: 'nav:/explore', text: 'x' } }).error, 'type needs an input');
assert.equal(ok({ action: { type: 'type', id: 'search', text: 'AI' } }).action.submit, true);
assert.ok(ok({ action: { type: 'open_post', id: '999' } }).error, 'unknown post rejected');
assert.ok(ok({ action: { type: 'drag_to_keep', postId: '1', folderId: 'keep' } }).error, 'save gated');
assert.equal(ok({ action: { type: 'drag_to_keep', postId: '1', folderId: 'keep' } }, true).action.type, 'drag_to_keep');
assert.ok(ok({ action: { type: 'drag_to_keep', postId: '1', folderId: 'nope' } }, true).error, 'unknown folder rejected');
assert.ok(ok({ action: { type: 'navigate', route: 'https://evil.com' } }).error, 'external route rejected');
assert.equal(ok({ action: { type: 'navigate', route: '/search?q=AI' } }).action.route, '/search?q=AI');
assert.deepEqual(ok({ action: { type: 'ask_user', question: 'どれ？', choices: ['A', 'B'] } }).action.choices, ['A', 'B']);
assert.ok(ok({ action: { type: 'rm_rf' } }).error);
assert.ok(m.wantsSave('このポストをKeepに保存して') && !m.wantsSave('AIのポストを探して'));
const req = m.buildAxRequest({ goal: 'AIのポストを探して', snap, log: ['1. 移動 → 成功'] });
assert.equal(req.length, 2, 'system + one user message only (no chat history)');
assert.ok(req[1].content.includes('nav:/explore') && req[1].content.includes('@a: hello'));
console.log('actions planner tests: all passed');
