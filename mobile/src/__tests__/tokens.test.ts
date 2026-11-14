import { darkColors, lightColors, type ThemeColors } from '../ui/theme/tokens';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const TEXT_TOKENS: (keyof ThemeColors)[] = ['textPrimary', 'textSecondary', 'textTertiary', 'link', 'success', 'warning', 'danger'];
const BACKGROUNDS: (keyof ThemeColors)[] = ['bg', 'surface'];

describe('design tokens', () => {
  it('light and dark define the same tokens', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
  });

  it('keeps the approved look (docs/ui-refresh/prompts.md, "The look")', () => {
    expect(lightColors).toMatchObject({ bg: '#F3F5F9', surface: '#FFFFFF', textPrimary: '#0F1B2D', accent: '#2459D6', hero: '#0F1B2D', highlight: '#FFB547' });
    expect(darkColors).toMatchObject({ bg: '#0B111A', surface: '#141C28', textPrimary: '#EEF2F7', accent: '#2F6BE6', hero: '#16233A', highlight: '#FFB547' });
  });

  for (const [name, colors] of [
    ['dark', darkColors],
    ['light', lightColors],
  ] as const) {
    it.each(TEXT_TOKENS.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg])))(`${name}: %s on %s meets WCAG AA (4.5:1)`, (fg, bg) => {
      expect(contrast(colors[fg as keyof ThemeColors], colors[bg as keyof ThemeColors])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('light: text on accent meets AA', () => {
    expect(contrast(lightColors.onAccent, lightColors.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark: text on accent meets AA too (the old sampled blue was an exception at 4.06:1)', () => {
    expect(contrast(darkColors.onAccent, darkColors.accent)).toBeGreaterThanOrEqual(4.5);
  });
});
