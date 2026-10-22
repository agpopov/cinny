import chroma from 'chroma-js';
import type { ThemeKind } from '../hooks/useTheme';

export const accessibleColor = (themeKind: ThemeKind, color: string): string => {
  if (!chroma.valid(color)) return color;

  const dark = themeKind === 'dark';
  // Cover the raised message/reply surfaces as well as the main background.
  const background = dark ? '#3b3b3b' : '#dedede';
  let adjusted = chroma(color).alpha(1);
  let lightness = adjusted.lab()[0];
  for (let step = 0; step < 100 && chroma.contrast(adjusted, background) < 4.6; step += 1) {
    lightness = Math.max(0, Math.min(100, lightness + (dark ? 1 : -1)));
    adjusted = adjusted.set('lab.l', lightness);
  }
  return adjusted.hex();
};
