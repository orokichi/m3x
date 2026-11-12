// Prints the Material Symbols names used in the source (for ICONS in app/layout.tsx).
// Usage: node scripts/icons.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const res = await fetch('https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsRounded%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints');
const all = new Set((await res.text()).split('\n').map((l) => l.split(' ')[0]).filter(Boolean));
const tokens = new Set();
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) for (const m of readFileSync(p, 'utf8').matchAll(/[a-z][a-z0-9_]+/g)) tokens.add(m[0]); });
['app', 'components', 'lib'].forEach(walk);
console.log([...tokens].filter((t) => all.has(t)).sort().join(','));
