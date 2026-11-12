'use client';
/* Heavy part (material-color-utilities): only imported dynamically when the seed changes / no cache. */
import { argbFromHex, hexFromArgb, Hct, SchemeVibrant, SchemeTonalSpot, MaterialDynamicColors } from '@material/material-color-utilities';

const ROLES = [
  'primary','onPrimary','primaryContainer','onPrimaryContainer','secondary','onSecondary','secondaryContainer','onSecondaryContainer',
  'tertiary','onTertiary','tertiaryContainer','onTertiaryContainer','error','onError','errorContainer','onErrorContainer',
  'surface','onSurface','surfaceVariant','onSurfaceVariant','surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow',
  'surfaceContainer','surfaceContainerHigh','surfaceContainerHighest','outline','outlineVariant','inverseSurface','inverseOnSurface','inversePrimary','scrim','shadow',
] as const;
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function schemeCss(seed: string, dark: boolean) {
  const hct = Hct.fromInt(argbFromHex(seed));
  // Very low-chroma seeds (greys) read better as tonal spot than vibrant.
  const scheme = hct.chroma < 12 ? new SchemeTonalSpot(hct, dark, 0) : new SchemeVibrant(hct, dark, 0);
  return ROLES.map((r) => `--md-${kebab(r)}:${hexFromArgb((MaterialDynamicColors as any)[r].getArgb(scheme))};`).join('');
}
