/**
 * A trip idea for a chat (the share sheet's Trip idea tile, mockup 5): where, roughly
 * when (a month, then early, mid or late in it), for how many days, and a short note.
 * Friends answer I'm in, Maybe or Can't on the card.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { ideaCard, nextMonths, sendCard } from '../../../src/features/chat/share';
import { useVisits } from '../../../src/features/map/visits';
import { localToday } from '../../../src/features/trips/dates';
import { DestinationSearch } from '../../../src/features/trips/new/DestinationSearch';
import { canLocate, LocatorMap } from '../../../src/features/trips/new/LocatorMap';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { destinationsApi, placesApi } from '../../../src/services/api';
import type { Destination, IdeaPart } from '../../../src/types';
import { Button } from '../../../src/ui/Button';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

// The server's limit for a trip idea's note
const MAX_NOTE = 120;
const DAYS = [1, 2, 3, 4, 5, 6, 7];
const PARTS: IdeaPart[] = ['early', 'mid', 'late'];

export default function ShareIdeaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const client = useQueryClient();
  const { chat } = useLocalSearchParams<{ chat: string }>();
  const me = useMe().data;
  const destinations = useQuery({ queryKey: ['destinations'], queryFn: destinationsApi.list });
  const places = useQuery({ queryKey: ['places', 'all'], queryFn: () => placesApi.list(), staleTime: 10 * 60_000 });
  const { data: visits = [] } = useVisits(me?.id);

  const [destination, setDestination] = useState<Destination | null>(null);
  const [searching, setSearching] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [part, setPart] = useState<IdeaPart | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const months = useMemo(() => nextMonths(), []);
  const thisYear = new Date().getFullYear();
  const monthLabel = (m: string) => {
    const [y, mm] = m.split('-').map(Number);
    return new Date(y, mm - 1, 1).toLocaleDateString(i18n.language, y === thisYear ? { month: 'short' } : { month: 'short', year: 'numeric' });
  };

  const send = () => {
    if (!me || !destination) return;
    sendCard(client, me.id, Number(chat), ideaCard(destination, { month, part: month ? part : null, days, note: note.trim() || null }));
    router.back();
  };

  const chip = (key: string, label: string, on: boolean, onPress: () => void) => (
    <PressableScale
      key={key}
      pressEffect="opacity"
      haptic="selection"
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      testID={`idea-${key}`}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </PressableScale>
  );

  if (searching) {
    return (
      <DestinationSearch
        destinations={destinations.data ?? []}
        places={places.data ?? []}
        visits={visits}
        selected={destination?.name ?? ''}
        today={localToday()}
        onClose={() => setSearching(false)}
        onPick={(d) => {
          setDestination(d);
          setSearching(false);
        }}
      />
    );
  }

  return (
    // Under a header: the keyboard is measured from the screen's top, so the header counts too
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label} accessibilityRole="header">
          {t('chat.share.ideaWhere')}
        </Text>
        <PressableScale
          pressEffect="opacity"
          haptic="light"
          onPress={() => setSearching(true)}
          style={styles.where}
          accessibilityRole="button"
          accessibilityLabel={destination ? t('chat.share.ideaChange', { destination: destination.name }) : t('chat.share.ideaWhere')}
          testID="idea-where"
        >
          {destination && canLocate(destination.latitude, destination.longitude) ? (
            <View style={styles.map}>
              <LocatorMap lat={destination.latitude!} lon={destination.longitude!} region={destination.region_code} size={48} />
            </View>
          ) : (
            <MaterialCommunityIcons name="magnify" size={22} color={colors.textSecondary} />
          )}
          <Text style={[styles.whereText, !destination && styles.placeholder]} numberOfLines={1}>
            {destination ? destination.name : t('newTrip.search.placeholder')}
          </Text>
        </PressableScale>

        <Text style={styles.label} accessibilityRole="header">
          {t('chat.share.ideaWhen')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup">
          {chip('anytime', t('chat.share.ideaAnytime'), month === null, () => setMonth(null))}
          {months.map((m) => chip(`month-${m}`, monthLabel(m), month === m, () => setMonth(m)))}
        </ScrollView>
        {month ? (
          <View style={styles.chipsWrap} accessibilityRole="radiogroup">
            {chip('part-any', t('chat.share.ideaWhole'), part === null, () => setPart(null))}
            {PARTS.map((p) => chip(`part-${p}`, t(`chat.cards.idea.${p}`, { month: monthLabel(month) }), part === p, () => setPart(p)))}
          </View>
        ) : null}

        <Text style={styles.label} accessibilityRole="header">
          {t('chat.share.ideaDays')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup">
          {chip('days-any', t('chat.share.ideaDaysAny'), days === null, () => setDays(null))}
          {DAYS.map((n) => chip(`days-${n}`, t('chat.cards.idea.days', { count: n, n: f.n(n) }), days === n, () => setDays(n)))}
        </ScrollView>

        <Text style={styles.label} accessibilityRole="header">
          {t('chat.share.ideaNote')}
        </Text>
        <TextInput
          autoComplete="off"
          importantForAutofill="no"
          value={note}
          onChangeText={setNote}
          placeholder={t('chat.share.ideaNotePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_NOTE}
          style={styles.input}
          accessibilityLabel={t('chat.share.ideaNote')}
          testID="idea-note"
        />
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={t('chat.share.send')} onPress={send} disabled={!destination} testID="idea-send" />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  body: { padding: t.spacing.lg, gap: t.spacing.sm },
  label: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary, textTransform: 'uppercase', marginTop: t.spacing.md },
  where: {
    minHeight: 64,
    borderRadius: 16,
    backgroundColor: t.colors.surface,
    paddingHorizontal: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  map: { borderRadius: 12, overflow: 'hidden', backgroundColor: t.colors.surfaceInset },
  whereText: { ...t.type.body, flex: 1, color: t.colors.textPrimary },
  placeholder: { color: t.colors.textTertiary },
  chips: { gap: t.spacing.sm, paddingVertical: 2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  chip: { minHeight: 44, borderRadius: 999, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: t.colors.surface },
  chipOn: { backgroundColor: t.colors.accentStrong },
  chipText: { ...t.type.callout, color: t.colors.textPrimary },
  chipTextOn: { color: t.colors.onAccent, fontWeight: '600' },
  input: {
    ...t.type.body,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: t.colors.textPrimary,
    backgroundColor: t.colors.surface,
  },
  footer: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm },
}));
