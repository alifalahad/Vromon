/**
 * WCAG AA contrast (prompt §9): every text colour against every surface it is
 * drawn on, in both appearances. 4.5:1 for normal text.
 */

import { contrast, mix } from '../features/mapThemes/color';
import { planColors } from '../features/trips/plan/colors';
import { reviewColors } from '../features/trips/review/colors';
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

  it("the stay's bed or house on its map pin, and the pin against the map (docs/trip-upgrades, step 2)", () => {
    const plan = planColors({ scheme: colors === darkColors ? 'dark' : 'light', colors });
    expect(contrast(plan.onStay, plan.stay)).toBeGreaterThanOrEqual(AA);
    // an icon on a map: 3:1 against the map's ground
    expect(contrast(plan.stay, colors.surfaceInset)).toBeGreaterThanOrEqual(3);
  });

  it('Good and Bad, when chosen, on their green and red (trip upgrades step 7)', () => {
    const review = reviewColors({ scheme: colors === darkColors ? 'dark' : 'light' });
    expect(contrast(review.onGood, review.good)).toBeGreaterThanOrEqual(AA);
    expect(contrast(review.onBad, review.bad)).toBeGreaterThanOrEqual(AA);
  });

  it('"Not checked" on its badge, and the badge on every surface it sits on (trip upgrades step 6)', () => {
    const plan = planColors({ scheme: colors === darkColors ? 'dark' : 'light', colors });
    expect(contrast(plan.onUnchecked, plan.unchecked)).toBeGreaterThanOrEqual(AA);
    // the hollow map pin of a stop that isn't checked: its number in link colour on the surface
    expect(contrast(colors.link, colors.surface)).toBeGreaterThanOrEqual(AA);
  });

  it('text on the stay advisor card: primary and secondary text over the soft accent (trip upgrades step 4)', () => {
    const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(colors.accentSoft)!;
    const top = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
    const seen = mix(colors.surface, top.toUpperCase(), Number(m[4]));
    expect(contrast(colors.textPrimary, seen)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textSecondary, seen)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onAccentSoft, seen)).toBeGreaterThanOrEqual(AA);   // "Why?"
  });

  it('white on the strong accent (filled buttons)', () => {
    expect(contrast(colors.onAccent, colors.accentStrong)).toBeGreaterThanOrEqual(AA);
  });

  it('the hero card: its text, its second lines and the marigold highlight (UI refresh, "The look")', () => {
    expect(contrast(colors.onHero, colors.hero)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onHeroSecondary, colors.hero)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.highlight, colors.hero)).toBeGreaterThanOrEqual(AA);
  });

  it('blue text on the solid blue tint (the selected tab, quiet blue buttons)', () => {
    expect(contrast(colors.onAccentSoft, colors.accentTint)).toBeGreaterThanOrEqual(AA);
    // an unselected tab's label and icon on the bar
    expect(contrast(colors.textSecondary, colors.surface)).toBeGreaterThanOrEqual(AA);
    // a layer tile that's on, and a chosen colour set (Map sheet and Map theme, UI refresh step 3)
    expect(contrast(colors.textPrimary, colors.accentTint)).toBeGreaterThanOrEqual(AA);
  });

  it("the Trips tab: the hero card's button, \"On now\", the labels over its picture, the place chips (UI refresh step 9)", () => {
    expect(contrast(colors.onHeroButton, colors.heroButton)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onHighlight, colors.highlight)).toBeGreaterThanOrEqual(AA);
    // A label's see-through fill over the lightest the picture gets (white)
    const [r, g, b, a] = colors.heroChip.match(/[\d.]+/g)!.map(Number);
    const over = (c: number) => Math.round(c * a + 255 * (1 - a)).toString(16).padStart(2, '0');
    expect(contrast(colors.onHero, `#${over(r)}${over(g)}${over(b)}`)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textPrimary, colors.surfaceInset)).toBeGreaterThanOrEqual(AA);
    // A quiet button's ring and the meter show on the hero card (3:1)
    expect(contrast(colors.heroOutline, colors.hero)).toBeGreaterThanOrEqual(1.9);
    expect(contrast(colors.heroMeter, colors.heroTrack)).toBeGreaterThanOrEqual(3);
  });

  it('moving a stop to another day: the chips, the chosen one and the current day (UI refresh step 8)', () => {
    expect(contrast(colors.link, colors.accentTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onAccent, colors.accentStrong)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textSecondary, colors.bg)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.link, colors.surface)).toBeGreaterThanOrEqual(AA);
  });

  it('Explore: the switch, a mark as a chip and on a card, the words over a photo (UI refresh step 12)', () => {
    expect(contrast(colors.textPrimary, colors.segmentThumb)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textSecondary, colors.segmentTrack)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onMarkTint, colors.markTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onMarkTint, colors.surface)).toBeGreaterThanOrEqual(AA);
    // At the foot of a photo the shade is at least 78% (the frames' gradient): over a white photo
    const over = (top: string, a: number) =>
      `#${[1, 3, 5].map((i) => Math.round(parseInt(top.slice(i, i + 2), 16) * a + 255 * (1 - a)).toString(16).padStart(2, '0')).join('')}`;
    expect(contrast(colors.onPhoto, over(colors.photoShade, 0.78))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onPhotoSecondary, over(colors.photoShade, 0.78))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.linkOnWhite, colors.heroButton)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onHeroButton, colors.heroButton)).toBeGreaterThanOrEqual(AA);
  });

  it("Settings: the travel numbers on the hero card, and each group's icon on its tint (UI refresh step 13)", () => {
    for (const text of [colors.highlight, colors.onHero, colors.onHeroSecondary]) {
      expect(contrast(text, colors.heroInset)).toBeGreaterThanOrEqual(AA);
    }
    // The quiet button's ring on the hero card ("Friend code"), as on the Trips tab
    expect(contrast(colors.heroOutline, colors.hero)).toBeGreaterThanOrEqual(1.9);
    // Icons need 3:1 against their circle; translucent tints are seen over the card
    const seen = (tint: string, under: string) => {
      const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(tint);
      if (!m) return tint;
      const top = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      return mix(under, top, Number(m[4]));
    };
    expect(contrast(colors.onAccentSoft, colors.accentTint)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.success, seen(colors.successBg, colors.surface))).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.textSecondary, colors.surfaceInset)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.danger, seen(colors.dangerBg, colors.surface))).toBeGreaterThanOrEqual(3);
    // A username's check, as words inside the field: "Yours", "Free", "Taken", "Checking…"
    expect(contrast(colors.success, seen(colors.successBg, colors.surface))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.danger, seen(colors.dangerBg, colors.surface))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textSecondary, colors.surfaceInset)).toBeGreaterThanOrEqual(AA);
  });

  it('the plan (UI refresh step 14): the phase chip, the timeline, the Tonight card and the sun', () => {
    const dark = colors === darkColors;
    const plan = planColors({ scheme: dark ? 'dark' : 'light', colors });
    const sheet = dark ? colors.bg : colors.surface;
    const seen = (tint: string, under: string) => {
      const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(tint);
      if (!m) return tint;
      const top = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      return mix(under, top, Number(m[4]));
    };
    // The phase chip: "In 6 days" amber on its tint, "Day 2 of 3" blue on the blue tint, "Finished" grey
    expect(contrast(colors.warning, seen(colors.warningBg, sheet))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onAccentSoft, colors.accentTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textSecondary, colors.surfaceInset)).toBeGreaterThanOrEqual(AA);
    // The stops' numbers on their badges
    expect(contrast(plan.onVisit, plan.visit)).toBeGreaterThanOrEqual(AA);
    expect(contrast(plan.onMeal, plan.meal)).toBeGreaterThanOrEqual(AA);
    // The Tonight card and Add a stop, on the blue tint: the words, the second line and "Change"
    for (const text of [colors.textPrimary, colors.textSecondary, colors.link]) expect(contrast(text, colors.accentTint)).toBeGreaterThanOrEqual(AA);
    // The bed on its square (an icon: 3:1), and the sun on a day tab and in the time column
    expect(contrast(colors.onHero, dark ? colors.accentStrong : colors.hero)).toBeGreaterThanOrEqual(3);
    expect(contrast(plan.sun, colors.surfaceInset)).toBeGreaterThanOrEqual(3);
    expect(contrast(plan.sun, sheet)).toBeGreaterThanOrEqual(3);
  });

  it('on the trip (UI refresh step 15): the Now card, "Now" and "Next", the green "Day 2 of 3", "Done"', () => {
    const dark = colors === darkColors;
    const sheet = dark ? colors.bg : colors.surface;
    const seen = (tint: string, under: string) => {
      const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(tint);
      if (!m) return tint;
      const top = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      return mix(under, top, Number(m[4]));
    };
    // The hero card: "NOW · 11:30", the stop, its second line, "Today ›", and late words
    for (const text of [colors.highlight, colors.onHero, colors.onHeroSecondary, colors.heroLink, colors.heroWarning]) {
      expect(contrast(text, colors.hero)).toBeGreaterThanOrEqual(AA);
    }
    // The "Now" pill (amber words on the warm tint) and "Next" (blue on the blue tint)
    expect(contrast(colors.warning, colors.markTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onAccentSoft, colors.accentTint)).toBeGreaterThanOrEqual(AA);
    // "Day 2 of 3" in green on its tint, over the sheet; "Done" in green on the sheet
    expect(contrast(colors.success, seen(colors.successBg, sheet))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.success, sheet)).toBeGreaterThanOrEqual(AA);
  });

  it('after the trip (UI refresh step 16): "Your trip", its rating, the map offer, the rows\' Good and Bad', () => {
    const dark = colors === darkColors;
    const sheet = dark ? colors.bg : colors.surface;
    const card = dark ? colors.surface : colors.bg;
    const seen = (tint: string, under: string) => {
      const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(tint);
      if (!m) return tint;
      const top = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      return mix(under, top, Number(m[4]));
    };
    // "YOUR TRIP" in marigold, the numbers, their words, "Rate things one by one" and "3 rated" on the hero
    for (const text of [colors.highlight, colors.onHero, colors.onHeroSecondary, colors.heroLink]) {
      expect(contrast(text, colors.hero)).toBeGreaterThanOrEqual(AA);
    }
    // "Edit" on its quiet button, and the empty stars on the hero (3:1, a drawing)
    expect(contrast(colors.onHero, seen(colors.heroQuiet, colors.hero))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onHeroSecondary, colors.hero)).toBeGreaterThanOrEqual(3);
    // The map offer: the pin on its warm square (3:1), "Mark visited", "Not now"
    expect(contrast(colors.onMarkTint, colors.markTint)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.onAccent, colors.accentStrong)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textPrimary, colors.surfaceInset)).toBeGreaterThanOrEqual(AA);
    // "Plan it again" (blue on the blue tint) and "Finished" / "Not taken" (grey on the inset)
    expect(contrast(colors.onAccentSoft, colors.accentTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textSecondary, colors.surfaceInset)).toBeGreaterThanOrEqual(AA);
    // A row: its time on the sheet, its name, comment and "Rate" on the row's card; Good and Bad on their tints
    expect(contrast(colors.textPrimary, sheet)).toBeGreaterThanOrEqual(AA);
    for (const text of [colors.textPrimary, colors.textSecondary, colors.link]) expect(contrast(text, card)).toBeGreaterThanOrEqual(AA);
    const review = reviewColors({ scheme: dark ? 'dark' : 'light' });
    expect(contrast(review.onGood, review.good)).toBeGreaterThanOrEqual(AA);
    expect(contrast(review.onBad, review.bad)).toBeGreaterThanOrEqual(AA);
  });

  it('Conditions (UI refresh step 17): the hero and the next rain on it, the strip, the next hours, "By the hour"', () => {
    const seen = (tint: string, under: string) => {
      const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(tint);
      if (!m) return tint;
      const top = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      return mix(under, top, Number(m[4]));
    };
    // The hero: "NOW · 11:30" in marigold, the temperature, its words; the next rain on its warm tint; "no rain" on the quiet one
    for (const text of [colors.highlight, colors.onHero, colors.onHeroSecondary]) expect(contrast(text, colors.hero)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.heroWarning, seen(colors.heroWarningTint, colors.hero))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onHero, seen(colors.heroQuiet, colors.hero))).toBeGreaterThanOrEqual(AA);
    // The strip: a day on its card, the chosen one in white on the blue, a day done on the inset; the dot's ring (3:1)
    expect(contrast(colors.textSecondary, colors.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.onAccent, colors.accentStrong)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.textSecondary, colors.surfaceInset)).toBeGreaterThanOrEqual(AA);
    const sun = planColors({ scheme: colors === darkColors ? 'dark' : 'light', colors }).sun;
    expect(contrast(sun, colors.surface)).toBeGreaterThanOrEqual(3);
    // The next hours: "Now" on the blue tint; a likely hour's chance on the warm tint
    expect(contrast(colors.onAccentSoft, colors.accentTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.warning, seen(colors.warningBg, colors.surface))).toBeGreaterThanOrEqual(AA);
    // By the hour: the temperature's line and the likely hours' columns on the card (3:1, drawings); the hours
    // under 60% are the lighter step, their values written in text colours and read hour by hour
    expect(contrast(colors.chartTemp, colors.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.accent, colors.surface)).toBeGreaterThanOrEqual(3);
  });

  it('Budget (UI refresh step 18): the hero and its statuses, the meter, the words inside the bar, Apply', () => {
    const seen = (tint: string, under: string) => {
      const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(tint);
      if (!m) return tint;
      const top = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      return mix(under, top, Number(m[4]));
    };
    // "THE PLAN COSTS ABOUT", the amount, its lines, "Change", and "left" / "only … left" / "over by" (each with an icon)
    for (const text of [colors.highlight, colors.onHero, colors.onHeroSecondary, colors.heroLink, colors.heroGood, colors.heroWarning, colors.heroDanger]) {
      expect(contrast(text, colors.hero)).toBeGreaterThanOrEqual(AA);
    }
    // The meter against its track and against the card (3:1, a drawing)
    expect(contrast(colors.heroBar, seen(colors.heroBarTrack, colors.hero))).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.heroBar, colors.hero)).toBeGreaterThanOrEqual(3);
    // The share written inside each piece of the bar
    expect(contrast(colors.onPartGettingThere, colors.partGettingThere)).toBeGreaterThanOrEqual(AA);
    for (const part of [colors.partStay, colors.partFood, colors.partTickets, colors.partLocal]) expect(contrast(colors.onPart, part)).toBeGreaterThanOrEqual(AA);
    // Apply on its blue tint; "Save ৳…" on the card
    expect(contrast(colors.onAccentSoft, colors.accentTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.success, colors.surface)).toBeGreaterThanOrEqual(AA);
  });

  it('What you spent (UI refresh step 19): the parts on their tracks, the chosen part, the plan mark, what no plan has', () => {
    const parts = [
      [colors.partGettingThere, colors.partGettingThereTrack],
      [colors.partStay, colors.partStayTrack],
      [colors.partFood, colors.partFoodTrack],
      [colors.partTickets, colors.partTicketsTrack],
      [colors.partLocal, colors.partLocalTrack],
    ];
    for (const [fill, track] of parts) {
      // Each track shows on the card; in dark each bar stands 3:1 on its track (light: the frames' own steps, with
      // the part's name and amount beside every bar)
      expect(contrast(track, colors.surface)).toBeGreaterThanOrEqual(1.15);
      if (colors === darkColors) expect(contrast(fill, track)).toBeGreaterThanOrEqual(3);
      else expect(contrast(fill, track)).toBeGreaterThanOrEqual(1.8);
    }
    // "What for": the chosen part is the text colour as its ground, with the card colour as its words
    expect(contrast(colors.surface, colors.textPrimary)).toBeGreaterThanOrEqual(AA);
    // By day: the spent bar and the plan's mark on the card (3:1, drawings)
    expect(contrast(colors.accent, colors.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.textPrimary, colors.surface)).toBeGreaterThanOrEqual(3);
    // A blue meter's track shows on the card, and the bar on it (the budget row, "Today")
    expect(contrast(colors.accentTrack, colors.surface)).toBeGreaterThanOrEqual(1.15);
    expect(contrast(colors.accent, colors.accentTrack)).toBeGreaterThanOrEqual(colors === darkColors ? 1.5 : 3);
    // "Not in the plan": its grey swatch, with the words beside it
    expect(contrast(colors.partUnplanned, colors.surface)).toBeGreaterThanOrEqual(2.9);
  });

  it("a switch's track when off shows on a card and on the ground (3:1)", () => {
    expect(contrast(colors.switchOff, colors.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.switchOff, colors.bg)).toBeGreaterThanOrEqual(3);
  });

  it("the snackbar: its text and its action on the other appearance's text colour", () => {
    const other = colors === darkColors ? lightColors : darkColors;
    expect(contrast(colors.bg, colors.textPrimary)).toBeGreaterThanOrEqual(AA);
    expect(contrast(other.link, colors.textPrimary)).toBeGreaterThanOrEqual(AA);
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
    expect(contrast(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(AA);
  });
});
