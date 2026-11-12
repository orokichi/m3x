'use client';
import { argbFromHex, hexFromArgb, Hct, SchemeVibrant, MaterialDynamicColors } from '@material/material-color-utilities';

const ROLES = [
  'primary','onPrimary','primaryContainer','onPrimaryContainer','secondary','onSecondary','secondaryContainer','onSecondaryContainer',
  'tertiary','onTertiary','tertiaryContainer','onTertiaryContainer','error','onError','errorContainer','onErrorContainer',
  'surface','onSurface','surfaceVariant','onSurfaceVariant','surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow',
  'surfaceContainer','surfaceContainerHigh','surfaceContainerHighest','outline','outlineVariant','inverseSurface','inverseOnSurface','inversePrimary','scrim','shadow',
] as const;
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function schemeCss(seed: string, dark: boolean) {
  const scheme = new SchemeVibrant(Hct.fromInt(argbFromHex(seed)), dark, 0);
  return ROLES.map((r) => `--md-${kebab(r)}:${hexFromArgb((MaterialDynamicColors as any)[r].getArgb(scheme))};`).join('');
}

export function applyTheme(seed: string, mode: 'system' | 'light' | 'dark') {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  let el = document.getElementById('m3-theme') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'm3-theme'; document.head.appendChild(el); }
  el.textContent = `:root{${schemeCss(seed, dark)}color-scheme:${dark ? 'dark' : 'light'}}`;
  document.documentElement.dataset.dark = dark ? '1' : '0';
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--md-surface').trim();
  if (meta && bg) meta.setAttribute('content', bg);
}
