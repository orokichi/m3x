// Shared by icons.mjs / check-icons.mjs. A "used icon" = any identifier-like token in
// app/components/lib *.ts(x) that is a Material Symbols name (superset on purpose: dynamic
// names like icon: 'home' or n={x ? 'a' : 'b'} are always caught).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SYMBOLS = join(root, 'scripts/symbols.txt');
export const LAYOUT = join(root, 'app/layout.tsx');
export const allSymbols = () => new Set(readFileSync(SYMBOLS, 'utf8').split('\n').filter(Boolean));
export function usedIcons() {
  const all = allSymbols(), tokens = new Set();
  const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) for (const m of readFileSync(p, 'utf8').matchAll(/[a-z][a-z0-9_]+/g)) tokens.add(m[0]); });
  ['app', 'components', 'lib'].forEach((d) => walk(join(root, d)));
  return [...tokens].filter((t) => all.has(t)).sort();
}
export const subsetIcons = () => new Set((readFileSync(LAYOUT, 'utf8').match(/const ICONS = '([^']*)'/)?.[1] || '').split(',').filter(Boolean));
