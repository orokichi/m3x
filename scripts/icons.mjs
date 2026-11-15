// Regenerates ICONS in app/layout.tsx from the Material Symbols names used in the source.
// Usage: node scripts/icons.mjs            (uses the vendored scripts/symbols.txt)
//        node scripts/icons.mjs --refresh  (re-downloads the official codepoints list first)
import { readFileSync, writeFileSync } from 'node:fs';
import { usedIcons, LAYOUT, SYMBOLS } from './icon-lib.mjs';
if (process.argv.includes('--refresh')) {
  const res = await fetch('https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsRounded%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints');
  const names = [...new Set((await res.text()).split('\n').map((l) => l.split(' ')[0]).filter(Boolean))].sort();
  writeFileSync(SYMBOLS, names.join('\n') + '\n');
}
const list = usedIcons().join(',');
const src = readFileSync(LAYOUT, 'utf8');
const out = src.replace(/const ICONS = '[^']*';/, `const ICONS = '${list}';`);
writeFileSync(LAYOUT, out);
console.log(`${list.split(',').length} icons → app/layout.tsx${out === src ? ' (unchanged)' : ''}`);
