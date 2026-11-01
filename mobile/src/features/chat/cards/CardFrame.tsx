/**
 * The shape every card in chat shares (docs/friends-chat-plan.md, section 2; mockup 5):
 * 288 wide, radius 20 with the tail corner, a small map or icon, the small capitals
 * ("TRIP PLAN"), the title, one grey line, then at most two pill buttons, and the time
 * (with your ticks) at the bottom. Cards you sent are blue-grey (`cardMine`).
 *
 * The heading part is one stop for screen readers; the buttons are their own stops.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, View, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';

import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { canLocate, LocatorMap } from '../../trips/new/LocatorMap';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type CardTone = 'trip' | 'place' | 'idea' | 'poll' | 'invite' | 'checkin' | 'late' | 'live';

export function CardFrame({
  mine,
  tail,
  tone,
  eyebrow,
  title,
  line,
  map,
  icon,
  label,
  footer,
  children,
  testID,
  a11yActions,
  onA11yAction,
}: {
  mine: boolean;
  /** The last of a run: the bubble's tail corner */
  tail: boolean;
  tone: CardTone;
  eyebrow?: string | null;
  title: string;
  line?: string | null;
  /** A locator map of the home country, when the place is in it */
  map?: { lat?: number | null; lon?: number | null; region?: string | null; size: 48 | 64 } | null;
  /** Otherwise an icon */
  icon?: Icon;
  /** What a screen reader says for the heading part */
  label: string;
  /** The time and your ticks */
  footer: React.ReactNode;
  children?: React.ReactNode;
  testID?: string;
  a11yActions?: AccessibilityActionInfo[];
  onA11yAction?: (e: AccessibilityActionEvent) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const eyebrowColor = mine ? colors.cardEyebrowMine : tone === 'idea' ? colors.warning : colors.onAccentSoft;
  const located = map && canLocate(map.lat, map.lon) ? map : null;
  return (
    <View style={[styles.card, mine ? styles.mine : styles.theirs, tail && (mine ? styles.mineTail : styles.theirsTail)]} testID={testID}>
      <View style={styles.head} accessible accessibilityLabel={label} accessibilityActions={a11yActions} onAccessibilityAction={onA11yAction}>
        {located ? (
          <View style={[styles.mapTile, { width: located.size, height: located.size }]}>
            <LocatorMap lat={located.lat!} lon={located.lon!} region={located.region} size={located.size} />
          </View>
        ) : icon ? (
          <View style={styles.iconTile}>
            <MaterialCommunityIcons name={icon} size={26} color={colors.onAccentSoft} />
          </View>
        ) : null}
        <View style={styles.text}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: eyebrowColor }]}>{eyebrow}</Text> : null}
          <Text style={styles.title} numberOfLines={3}>
            {title}
          </Text>
          {line ? <Text style={[styles.line, mine && styles.lineMine]}>{line}</Text> : null}
        </View>
      </View>
      {children}
      {footer}
    </View>
  );
}

/** A pill button on a card: grey on theirs, light on yours; `selected` fills it blue (an answer you chose). */
export function CardButton({
  label,
  icon,
  mine,
  selected,
  disabled,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  testID,
}: {
  label: string;
  icon?: Icon;
  mine: boolean;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'radio' | 'checkbox';
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = selected ? colors.onAccent : colors.textPrimary;
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="light"
      disabled={disabled}
      onPress={onPress}
      // 44 high plus this: a 48 dp target
      hitSlop={{ top: 2, bottom: 2 }}
      style={[styles.button, mine ? styles.buttonMine : styles.buttonTheirs, selected && styles.buttonSelected, disabled && styles.buttonDisabled]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={accessibilityRole === 'button' ? { disabled: !!disabled, selected: !!selected } : { checked: !!selected, disabled: !!disabled }}
      testID={testID}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={17} color={color} /> : null}
      {/* Two lines when it must ("On your Want list" in half a card, and Bangla runs longer) */}
      <Text style={[styles.buttonText, { color }]} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: { width: 288, maxWidth: '86%', borderRadius: 20, padding: 12, gap: 12 },
  mine: { backgroundColor: t.colors.cardMine },
  theirs: { backgroundColor: t.colors.bubbleTheirs },
  mineTail: { borderBottomRightRadius: 6 },
  theirsTail: { borderBottomLeftRadius: 6 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  mapTile: { borderRadius: 14, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  iconTile: { width: 48, height: 48, borderRadius: 14, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { ...t.type.body, fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.colors.textPrimary },
  line: { ...t.type.caption, fontSize: 13, lineHeight: 18, color: t.colors.textSecondary },
  lineMine: { color: t.colors.cardMineText2 },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonTheirs: { backgroundColor: t.colors.surfaceRaised },
  buttonMine: { backgroundColor: t.colors.cardButtonMine },
  buttonSelected: { backgroundColor: t.colors.accentStrong },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { ...t.type.callout, flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
}));
