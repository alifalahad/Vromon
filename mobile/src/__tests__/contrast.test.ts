/**
 * WCAG AA contrast (prompt §9): every text colour against every surface it is
 * drawn on, in both appearances. 4.5:1 for normal text.
 */

import { contrast, mix } from '../features/mapThemes/color';
import { AVATAR_COLORS } from '../ui/Avatar';
import { ON_SUNSET, SUNSET_CARD } from '../ui/theme/cards';
import { darkColors, lightColors, SENDER_NAMES, type ThemeColors } from '../ui/theme/tokens';

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

  it('text on the soft accent buttons and chips, over every surface (Apply, Mark visited, Refresh)', () => {
    // accentSoft is translucent: what's seen is it painted over the surface
    const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(colors.accentSoft)!;
    const top = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
    for (const under of SURFACES) {
      const seen = mix(colors[under], top.toUpperCase(), Number(m[4]));
      expect(contrast(colors.onAccentSoft, seen)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('text on the glass over the map (capsule, round buttons, dock), whatever the map shows under it', () => {
    const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(colors.glass)!;
    const top = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    for (const under of ['#000000', '#FFFFFF']) {
      const seen = mix(under, top, Number(m[4]));
      for (const text of ['textPrimary', 'textSecondary', 'link'] as const) {
        expect(contrast(colors[text], seen)).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('white on the strong accent (filled buttons)', () => {
    expect(contrast(colors.onAccent, colors.accentStrong)).toBeGreaterThanOrEqual(AA);
  });

  it('white on the sunset cards (next trip, Today\'s "Now")', () => {
    expect(contrast(ON_SUNSET, SUNSET_CARD)).toBeGreaterThanOrEqual(AA);
  });

  it('chat bubbles: white on yours, primary and secondary text on theirs', () => {
    expect(contrast(colors.onAccent, colors.bubbleMine)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textPrimary, colors.bubbleTheirs)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textSecondary, colors.bubbleTheirs)).toBeGreaterThanOrEqual(AA);
  });

  it('cards in chat: text on the ones you sent, their buttons, and the small capitals on everyone\'s', () => {
    expect(contrast(colors.textPrimary, colors.cardMine)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.cardMineText2, colors.cardMine)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.cardEyebrowMine, colors.cardMine)).toBeGreaterThanOrEqual(AA);
    // The button fill is translucent in dark mode: what's seen is it over the card
    const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(colors.cardButtonMine);
    const button = m
      ? mix(colors.cardMine, `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase(), Number(m[4]))
      : colors.cardButtonMine;
    expect(contrast(colors.textPrimary, button)).toBeGreaterThanOrEqual(AA);
    // Theirs: a trip's or poll's capitals in onAccentSoft, an idea's in warning; buttons on surfaceRaised
    expect(contrast(colors.onAccentSoft, colors.bubbleTheirs)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.warning, colors.bubbleTheirs)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textPrimary, colors.surfaceRaised)).toBeGreaterThanOrEqual(AA);
  });

  it("trip rooms: every sender's name on other people's bubbles", () => {
    const names = SENDER_NAMES[colors === darkColors ? 'dark' : 'light'];
    expect(names.length).toBe(6);
    for (const c of names) expect(contrast(c, colors.bubbleTheirs)).toBeGreaterThanOrEqual(AA);
  });

  it('white initials on every avatar colour', () => {
    for (const c of AVATAR_COLORS) expect(contrast(colors.onAccent, c)).toBeGreaterThanOrEqual(AA);
  });

  it('text on the accent colour (buttons, FAB, badges)', () => {
    // Dark: the sampled #3379F3 is kept (decision §20): 4.06:1, AA for large text and UI parts
    expect(contrast(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(_name === 'dark' ? 3 : AA);
  });
});
