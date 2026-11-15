// Fails (exit 1) if an icon name used in the source is missing from ICONS in app/layout.tsx
// (missing icons render as raw ligature text such as "CONTENT_COPY"). Run: node scripts/check-icons.mjs
import { usedIcons, subsetIcons, allSymbols } from './icon-lib.mjs';
const sub = subsetIcons(), all = allSymbols();
const missing = usedIcons().filter((n) => !sub.has(n));
const bogus = [...sub].filter((n) => !all.has(n));
if (bogus.length) console.warn(`warning: not Material Symbols names: ${bogus.join(', ')}`);
if (missing.length) { console.error(`✖ ${missing.length} icon(s) missing from ICONS: ${missing.join(', ')}\n  → run: node scripts/icons.mjs`); process.exit(1); }
console.log(`✓ icons ok (${sub.size} in subset)`);
