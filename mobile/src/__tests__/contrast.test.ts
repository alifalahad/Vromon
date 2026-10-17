/**
 * WCAG AA contrast (prompt §9): every text colour against every surface it is
 * drawn on, in both appearances. 4.5:1 for normal text.
 */

import { contrast } from '../features/mapThemes/color';
import { darkColors, lightColors, type ThemeColors } from '../ui/theme/tokens';

const AA = 4.5;
const TEXT: (keyof ThemeColors)[] = ['textPrimary', 'textSecondary', 'textTertiary', 'link', 'danger', 'success', 'warning'];
// surfaceRaised (floating pill, round buttons) only ever carries primary and secondary text
const SURFACES: (keyof ThemeColors)[] = ['bg', 'surface', 'surfaceInset'];

describe.each([
  ['dark', darkColors],
  ['light', lightColors],
] as const)('%s appearance', (_name, colors) => {
  // Solid colours only: translucent tokens (scrim, *Soft, *Bg) are backgrounds, not text
  const solid = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

  it.each(TEXT.flatMap((text) => SURFACES.map((surface) => [text, surface] as const)))('%s on %s', (text, surface) => {
    if (!solid(colors[text]) || !solid(colors[surface])) return;
    expect(contrast(colors[text], colors[surface])).toBeGreaterThanOrEqual(AA);
  });

  it.each(['textPrimary', 'textSecondary'] as const)('%s on surfaceRaised', (text) => {
    expect(contrast(colors[text], colors.surfaceRaised)).toBeGreaterThanOrEqual(AA);
  });

  it('text on the accent colour (buttons, FAB, badges)', () => {
    // Dark: the sampled #3379F3 is kept (decision §20): 4.06:1, AA for large text and UI parts
    expect(contrast(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(_name === 'dark' ? 3 : AA);
  });
});
