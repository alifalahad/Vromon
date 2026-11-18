/**
 * Explore's pieces (docs/ui-refresh step 12, frames 22–25), shared by the tab, a district, a division, a
 * continent and a country: section headings, your mark as a chip, the district and "Ready to plan" cards, the
 * GI food cards, the rows of countries and cities, and the photo credits. Every photo keeps its credit.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { VisitStatus } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { localDigits } from '../trips/plan/usePlanFormat';
import { districtLine, localName, type DistrictCard, type ExplorePhoto, type Photo, type PlanPlace } from './api';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const MARK_ICON: Record<VisitStatus, Icon> = { visited: 'check', lived: 'home-outline', want: 'bookmark-outline' };

/** A section's title, with a link on the right ("All 64") and a line under it. */
export function SectionHead({
  title,
  note,
  link,
  onLink,
  linkLabel,
  testID,
}: {
  title: string;
  note?: string;
  link?: string;
  onLink?: () => void;
  linkLabel?: string;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <Text style={styles.headTitle} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        {link && onLink ? (
          <PressableScale
            pressEffect="opacity"
            haptic="selection"
            onPress={onLink}
            style={styles.headLink}
            accessibilityRole="button"
            accessibilityLabel={linkLabel ?? link}
            testID={testID}
          >
            <Text style={styles.headLinkText} maxFontSizeMultiplier={1.3}>
              {link}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {note ? <Text style={styles.headNote}>{note}</Text> : null}
    </View>
  );
}

/** Your mark on a place, as an icon and a word (colour is never the only sign). */
export function MarkChip({ status, style }: { status: VisitStatus; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const want = status === 'want';
  const ink = want ? colors.onAccentSoft : colors.onMarkTint;
  return (
    <View style={[styles.mark, { backgroundColor: want ? colors.accentTint : colors.markTint }, style]}>
      <MaterialCommunityIcons name={MARK_ICON[status]} size={14} color={ink} />
      <Text style={[styles.markText, { color: ink }]} maxFontSizeMultiplier={1.3}>
        {t(`travels.status.${status}`)}
      </Text>
    </View>
  );
}

/** The dark shade at the foot of a photo, so white words read on any picture; `top`: also a light one at its top, for buttons. */
export function PhotoShade({ from = 0.35, top = false }: { from?: number; top?: boolean }) {
  const { colors } = useTheme();
  const id = `shade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={fill} width="100%" height="100%" preserveAspectRatio="none" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.photoShade} stopOpacity={top ? 0.5 : 0} />
          <Stop offset={String(from)} stopColor={colors.photoShade} stopOpacity={0} />
          <Stop offset="1" stopColor={colors.photoShade} stopOpacity={0.86} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const fill = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } as const;

/** A photo, or the plain ground while it loads or when there is none. */
export function PlacePhoto({ photo, style }: { photo: ExplorePhoto | Photo | null | undefined; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const uri = photo?.thumb_url ?? photo?.url ?? null;
  return (
    <View style={[styles.photoGround, style]}>
      {uri ? <Image source={{ uri }} style={fill} contentFit="cover" transition={200} cachePolicy="disk" recyclingKey={uri} accessible={false} /> : null}
    </View>
  );
}

/**
 * A district as a photo card (frame 23): large (the first of a division) or small (two to a row), with its
 * counts, your mark and, on the large one, "You can plan it" with the sight the photo shows.
 */
export function DistrictTile({
  district,
  size,
  status,
  plannable,
  onPress,
}: {
  district: DistrictCard;
  size: 'large' | 'small';
  status: VisitStatus | null;
  plannable: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const lang = i18n.language;
  const large = size === 'large';
  // With large text the name needs the whole width: "You can plan it" moves to the top corner
  const chipOnTop = fontScale > 1.25;
  const name = localName(district, lang);
  const counts = districtLine(district, t, lang);
  const caption = large && district.photo?.kind === 'attraction' ? district.photo.caption : null;
  const label = [name, counts, status ? t(`travels.status.${status}`) : null, plannable ? t('explore.youCanPlan') : null].filter(Boolean).join(', ');
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.tile, large ? styles.tileLarge : styles.tileSmall]}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`district-card-${district.slug}`}
    >
      <PlacePhoto photo={district.photo} style={fill} />
      <PhotoShade from={large ? 0.35 : 0.36} />
      {status ? <MarkChip status={status} style={styles.tileMark} /> : null}
      <View style={styles.tileFoot}>
        <View style={styles.tileText}>
          <Text style={[styles.tileName, large && styles.tileNameLarge]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {name}
          </Text>
          <Text style={styles.tileLine} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {[counts, caption].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {large && plannable && !chipOnTop ? <CanPlan /> : null}
      </View>
      {large && plannable && chipOnTop ? <CanPlan style={styles.canPlanTop} /> : null}
    </PressableScale>
  );
}

function CanPlan({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={[styles.canPlan, style]}>
      <Text style={styles.canPlanText} maxFontSizeMultiplier={1.3}>
        {t('explore.youCanPlan')}
      </Text>
    </View>
  );
}

/** A division's districts (frame 23): the first large, the rest two to a row. */
export function DistrictGrid({
  districts,
  statusOf,
  plannable,
  onOpen,
}: {
  districts: readonly DistrictCard[];
  statusOf: (slug: string) => VisitStatus | null;
  plannable: (slug: string) => boolean;
  onOpen: (d: DistrictCard) => void;
}) {
  const styles = useStyles();
  const [first, ...rest] = districts;
  if (!first) return null;
  return (
    <View style={styles.grid}>
      <DistrictTile district={first} size="large" status={statusOf(first.slug)} plannable={plannable(first.slug)} onPress={() => onOpen(first)} />
      <View style={styles.pairs}>
        {rest.map((d) => (
          <View key={d.slug} style={styles.half}>
            <DistrictTile district={d} size="small" status={statusOf(d.slug)} plannable={plannable(d.slug)} onPress={() => onOpen(d)} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** "Ready to plan" (frame 22): the place, its district's photo and counts, and "Plan a trip". */
export function PlanCard({
  place,
  district,
  status,
  onOpen,
  onPlan,
  style,
}: {
  place: PlanPlace;
  district: DistrictCard | undefined;
  status: VisitStatus | null;
  onOpen: () => void;
  onPlan: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const districtName = district ? localName(district, lang) : null;
  // Kuakata is in Patuakhali: the counts are the district's, so say whose
  const sameAsDistrict = district?.name_en === place.name;
  const elsewhere = districtName && !sameAsDistrict ? t('explore.inDistrict', { name: districtName }) : null;
  // Places to plan have English names only: the district's own name in Bangla when it's the same place
  const title = sameAsDistrict && districtName ? districtName : place.name;
  const counts = district ? districtLine(district, t, lang) : null;
  return (
    <View style={[styles.planCard, style]} testID={`plan-card-${place.id}`}>
      <PressableScale
        pressEffect="opacity"
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={[title, elsewhere, counts].filter(Boolean).join(', ')}
      >
        <View style={styles.planPhoto}>
          <PlacePhoto photo={district?.photo} style={fill} />
          {status ? <MarkChip status={status} style={styles.planMark} /> : null}
        </View>
        <View style={styles.planText}>
          <Text style={styles.planName} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
          {elsewhere ? (
            <Text style={styles.planLine} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {elsewhere}
            </Text>
          ) : null}
          {counts ? (
            <Text style={styles.planLine} numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {counts}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      <PressableScale
        pressEffect="opacity"
        haptic="medium"
        onPress={onPlan}
        style={styles.planButton}
        accessibilityRole="button"
        accessibilityLabel={t('explore.planTrip', { place: title })}
        testID={`plan-trip-${place.id}`}
      >
        <Text style={styles.planButtonText} maxFontSizeMultiplier={1.3}>
          {t('explore.planATrip')}
        </Text>
        <MaterialCommunityIcons name="arrow-right" size={16} color={colors.link} />
      </PressableScale>
    </View>
  );
}

/** A GI food (frame 23): its name as the register gives it, in Bangla, and its district in the app's language. */
export function GiCard({ name, where, onPress }: { name: string; where: string; onPress?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale
      pressEffect="opacity"
      disabled={!onPress}
      onPress={onPress}
      style={styles.gi}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${name}, ${where}`}
    >
      <Text style={styles.giName} numberOfLines={3} maxFontSizeMultiplier={1.3}>
        {name}
      </Text>
      <View style={styles.giWhere}>
        <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.giWhereText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {where}
        </Text>
      </View>
    </PressableScale>
  );
}

/** A white card of rows (frame 24's "Most people"). */
export function RowCard({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.rowCard}>{children}</View>;
}

/** A country or a city in a list: its flag, name, a second line, your mark. */
export function PlaceRow({
  flag,
  icon,
  title,
  sub,
  status,
  onPress,
  last,
  testID,
}: {
  flag?: string;
  icon?: Icon;
  title: string;
  sub?: string | null;
  status?: VisitStatus | null;
  onPress?: () => void;
  last?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <>
      <PressableScale
        pressEffect="opacity"
        haptic="selection"
        disabled={!onPress}
        onPress={onPress}
        style={styles.row}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={[title, sub, status ? t(`travels.status.${status}`) : null].filter(Boolean).join(', ')}
        testID={testID}
      >
        {flag ? (
          <Text style={styles.rowFlag} accessible={false}>
            {flag}
          </Text>
        ) : (
          <MaterialCommunityIcons name={icon ?? 'map-marker-outline'} size={22} color={colors.textSecondary} style={styles.rowIcon} />
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
        {status ? <MarkChip status={status} /> : null}
        {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} /> : null}
      </PressableScale>
      {last ? null : <View style={styles.rowLine} />}
    </>
  );
}

/** The credits for the photos a screen shows, once each. */
export function PhotoCredits({ photos }: { photos: (ExplorePhoto | Photo | null | undefined)[] }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const lines = [...new Set(photos.map((p) => p?.attribution).filter((a): a is string => !!a))];
  if (!lines.length) return null;
  return (
    <View style={styles.credits}>
      <Text style={styles.creditsTitle}>{t('explore.photoCredits')}</Text>
      {lines.map((l) => (
        <Text key={l} style={styles.creditLine} numberOfLines={2}>
          {l}
        </Text>
      ))}
    </View>
  );
}

/** "Sources" at the end of a page. */
export function Sources({ lines }: { lines: string[] }) {
  const styles = useStyles();
  const { t } = useTranslation();
  if (!lines.length) return null;
  return (
    <View style={styles.credits}>
      <Text style={styles.creditsTitle}>{t('explore.sources')}</Text>
      {lines.map((l) => (
        <Text key={l} style={styles.creditLine}>
          {l}
        </Text>
      ))}
    </View>
  );
}

/** "38" over "Sights": a count that jumps to its section. */
export function CountCell({ value, label, onPress, first, testID }: { value: number; label: string; onPress?: () => void; first?: boolean; testID?: string }) {
  const styles = useStyles();
  const { i18n } = useTranslation();
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      disabled={!onPress}
      onPress={onPress}
      style={[styles.count, !first && styles.countLine]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${value} ${label}`}
      testID={testID}
    >
      <Text style={styles.countValue} maxFontSizeMultiplier={1.3}>
        {localDigits(String(value), i18n.language)}
      </Text>
      <Text style={styles.countLabel} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  head: { marginTop: 20, marginBottom: 10, marginHorizontal: 4, gap: 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headTitle: { ...t.type.title, fontSize: 20, lineHeight: 26, color: t.colors.textPrimary, flexShrink: 1 },
  headLink: { minHeight: 44, justifyContent: 'center', paddingLeft: 8 },
  headLinkText: { ...t.type.callout, fontSize: 14.5, fontWeight: '500', color: t.colors.link },
  headNote: { ...t.type.footnote, color: t.colors.textSecondary },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 26, paddingLeft: 8, paddingRight: 10, borderRadius: 13 },
  markText: { fontSize: 12, fontWeight: '700' },
  photoGround: { overflow: 'hidden', backgroundColor: t.colors.surfaceInset },
  tile: { borderRadius: 22, overflow: 'hidden', backgroundColor: t.colors.surfaceInset },
  tileLarge: { height: 184, borderRadius: 24 },
  tileSmall: { height: 150 },
  tileMark: { position: 'absolute', left: 10, top: 10 },
  tileFoot: { position: 'absolute', left: 14, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  tileText: { flex: 1, gap: 2 },
  tileName: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal', fontSize: 19, lineHeight: 23, color: t.colors.onPhoto },
  tileNameLarge: { fontSize: 24, lineHeight: 28 },
  tileLine: { fontSize: 12.5, color: t.colors.onPhotoSecondary },
  canPlan: { minHeight: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center', backgroundColor: t.colors.heroButton },
  canPlanTop: { position: 'absolute', right: 10, top: 10 },
  canPlanText: { fontSize: 12.5, fontWeight: '700', color: t.colors.onHeroButton },
  grid: { gap: 12 },
  pairs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  half: { width: '48.3%' },
  planCard: { width: 156, borderRadius: 20, overflow: 'hidden', backgroundColor: t.colors.surface, ...t.depth.card },
  planPhoto: { height: 104 },
  planMark: { position: 'absolute', left: 8, top: 8 },
  planText: { paddingTop: 10, paddingHorizontal: 12, gap: 2 },
  planName: { fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
  planLine: { fontSize: 12.5, color: t.colors.textSecondary },
  planButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12 },
  planButtonText: { fontSize: 13.5, fontWeight: '700', color: t.colors.link },
  gi: {
    width: 172,
    minHeight: 78,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: t.colors.surface,
    justifyContent: 'space-between',
    gap: 6,
    ...t.depth.card,
  },
  giName: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal', fontSize: 17, lineHeight: 22, color: t.colors.textPrimary },
  giWhere: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  giWhereText: { fontSize: 12.5, color: t.colors.textSecondary, flexShrink: 1 },
  rowCard: { borderRadius: 22, backgroundColor: t.colors.surface, overflow: 'hidden', ...t.depth.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingLeft: 16, paddingRight: 12 },
  rowFlag: { fontSize: 24 },
  rowIcon: { width: 24, textAlign: 'center' },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { ...t.type.body, fontWeight: '500', color: t.colors.textPrimary },
  rowSub: { ...t.type.footnote, color: t.colors.textSecondary },
  rowLine: { height: 1, marginLeft: 52, backgroundColor: t.colors.divider },
  credits: { marginTop: 24, gap: 4, paddingHorizontal: 4 },
  creditsTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary },
  creditLine: { ...t.type.caption, color: t.colors.textTertiary },
  count: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4, minHeight: 48, justifyContent: 'center' },
  countLine: { borderLeftWidth: 1, borderLeftColor: t.colors.divider },
  countValue: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal', fontSize: 24, lineHeight: 28, color: t.colors.textPrimary },
  countLabel: { fontSize: 12.5, color: t.colors.textSecondary, textAlign: 'center' },
}));
