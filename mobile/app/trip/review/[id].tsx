/**
 * "Rate things one by one" (trip upgrades step 7, D9): the trip's stars and comment at the top, then getting
 * there, each day's places and meals, and where you stayed. Each thing is Good 👍 or Bad 👎 (tap the chosen
 * one again to clear it) with an optional comment. "Mark all good" / "Mark all bad" set every thing not rated
 * yet; then change the few that differ. Save sends only what changed, and the screen stays with "Saved" (going
 * back in the same moment the leave guard switched off crashed react-native-screens: "ScreenStackFragment added
 * into a non-stack container"). Leaving with unsaved changes asks first.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDays, localToday } from '../../../src/features/trips/dates';
import { dayParts } from '../../../src/features/trips/plan/timeline';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { reviewColors } from '../../../src/features/trips/review/colors';
import { changes, draftOf, markAll, sections, toggle, type Draft } from '../../../src/features/trips/review/review';
import { Stars, starWord } from '../../../src/features/trips/review/Stars';
import { reviewKey } from '../../../src/features/trips/review/TripReviewCard';
import { tripsApi } from '../../../src/services/api';
import type { ReviewThing, Trip, TripReviewIn, TripReviewResponse, Verdict } from '../../../src/types';
import { Button } from '../../../src/ui/Button';
import { haptics } from '../../../src/ui/haptics';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

const COMMENT_MAX = 280;
type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const MODE_ICON: Record<string, Icon> = { bus: 'bus', train: 'train', plane: 'airplane', car: 'car', boat: 'ferry', walk: 'walk' };
const TARGET_ICON: Record<string, Icon> = {
  place: 'map-marker-outline',
  restaurant: 'silverware-fork-knife',
  hotel: 'bed-outline',
  stay_home: 'home-heart',
  journey: 'map-marker-path',
};

export default function TripReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const styles = useStyles();
  const { colors } = useTheme();
  const today = localToday();
  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const review = useQuery({ queryKey: reviewKey(tripId), queryFn: () => tripsApi.review(tripId, today), enabled: !!tripId, retry: false });
  const [saved, setSaved] = useState(false);
  if (review.isError || trip.isError) {
    const err = (review.error ?? trip.error) as Error;
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.message} testID="review-error">
          {err?.message}
        </Text>
      </View>
    );
  }
  if (!review.data || !trip.data) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.link} />
      </View>
    );
  }
  // Keyed: a fresh draft when the saved review reloads
  return <Editor key={review.data.review?.updated_at ?? 'new'} trip={trip.data} data={review.data} saved={saved} onSaved={() => setSaved(true)} />;
}

function Editor({ trip, data, saved, onSaved }: { trip: Trip; data: TripReviewResponse; saved: boolean; onSaved: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const today = localToday();
  const [rating, setRating] = useState(data.review?.rating ?? 0);
  const [comment, setComment] = useState(data.review?.comment ?? '');
  const [draft, setDraft] = useState<Draft>(() => draftOf(data.items));
  const [openComments, setOpenComments] = useState<Set<string>>(() => new Set(data.items.filter((i) => i.comment).map((i) => i.key)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemChanges = changes(data.items, draft);
  const ratingChanged = rating > 0 && rating !== (data.review?.rating ?? 0);
  const commentChanged = (comment.trim() || null) !== (data.review?.comment ?? null);
  const dirty = itemChanges.length > 0 || ratingChanged || commentChanged;

  // Leaving with changes not saved: ask once
  usePreventRemove(dirty, ({ data: { action } }) => {
    Alert.alert(t('review.discardTitle'), t('review.discardBody'), [
      { text: t('review.keepEditing'), style: 'cancel' },
      { text: t('review.discard'), style: 'destructive', onPress: () => navigation.dispatch(action) },
    ]);
  });
  const save = async () => {
    const body: TripReviewIn = {};
    if (ratingChanged) body.rating = rating;
    if (commentChanged) body.comment = comment.trim() || null;
    if (itemChanges.length) body.items = itemChanges;
    setSaving(true);
    setError(null);
    try {
      const res = await tripsApi.saveReview(trip.id, body, today);
      queryClient.setQueryData(reviewKey(trip.id), res);
      haptics.success();
      onSaved();
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : t('review.failed'));
    } finally {
      setSaving(false);
    }
  };

  const choose = (key: string, verdict: Verdict) => setDraft((d) => toggle(d, key, verdict));
  const setThingComment = (key: string, text: string) => setDraft((d) => ({ ...d, [key]: { ...d[key], comment: text } }));
  const unrated = Object.values(draft).filter((d) => !d.verdict).length;

  const sectionTitle = (kind: string, day: number | null) => {
    if (kind === 'journey') return t('review.gettingThere');
    if (kind === 'stays') return t('review.stays');
    const parts = dayParts(addDays(trip.start_date, (day ?? 1) - 1), i18n.language);
    return t('review.day', { n: f.n(day ?? 1), date: `${parts.weekday} ${parts.day}` });
  };
  const detail = (i: ReviewThing) => {
    if (i.target_type === 'journey') return i.mode ? t(`trips.modes.${i.mode}`, { defaultValue: i.mode }) : null;
    if (i.target_type === 'hotel' || i.target_type === 'stay_home') {
      if (i.first_night == null) return null;
      return i.first_night === i.last_night
        ? t('review.night', { n: f.n(i.first_night) })
        : t('review.nights', { first: f.n(i.first_night), last: f.n(i.last_night ?? i.first_night) });
    }
    return [i.meal ? t(`meals.slot.${i.meal}`, { defaultValue: i.meal }) : null, i.time ? f.time(i.time) : null].filter(Boolean).join(' · ');
  };
  const nameOf = (i: ReviewThing) => i.name || (i.target_type === 'stay_home' ? t('review.withFamily') : '');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">
            {t('review.title')}
          </Text>
          <Stars value={rating} onChange={setRating} label={t('review.starsA11y')} testID="review-star" />
          {rating ? <Text style={styles.muted}>{starWord(rating, t)}</Text> : null}
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder={t('review.commentPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            maxLength={COMMENT_MAX}
            multiline
            accessibilityLabel={t('review.commentLabel')}
            testID="review-comment"
          />
          <Text style={styles.muted}>{t('review.private')}</Text>
        </View>

        {data.items.length ? (
          <View style={styles.markAll}>
            <Button
              variant="small"
              label={t('review.markAllGood')}
              icon="thumb-up-outline"
              onPress={() => setDraft((d) => markAll(d, 'good'))}
              disabled={!unrated}
              testID="review-mark-good"
            />
            <Button
              variant="small"
              label={t('review.markAllBad')}
              icon="thumb-down-outline"
              onPress={() => setDraft((d) => markAll(d, 'bad'))}
              disabled={!unrated}
              testID="review-mark-bad"
            />
          </View>
        ) : (
          <Text style={styles.muted}>{t('review.nothing')}</Text>
        )}
        {data.items.length ? <Text style={styles.hint}>{t('review.markAllHint')}</Text> : null}

        {sections(data.items).map((s) => (
          <View key={s.key} style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {sectionTitle(s.kind, s.day)}
            </Text>
            {s.items.map((i) => {
              const d = draft[i.key] ?? { verdict: null, comment: '' };
              const name = nameOf(i);
              const icon = i.target_type === 'journey' ? (i.mode && MODE_ICON[i.mode]) || TARGET_ICON.journey : TARGET_ICON[i.target_type];
              const commentOpen = !!d.verdict && openComments.has(i.key);
              return (
                <View key={i.key} style={styles.row} testID={`review-row-${i.key}`}>
                  <View style={styles.rowTop}>
                    <View style={styles.icon}>
                      <MaterialCommunityIcons name={icon} size={20} color={colors.textSecondary} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.name}>{name}</Text>
                      {detail(i) ? <Text style={styles.muted}>{detail(i)}</Text> : null}
                    </View>
                  </View>
                  <Verdicts name={name} value={d.verdict} onChoose={(v) => choose(i.key, v)} testKey={i.key} />
                  {d.verdict && !commentOpen ? (
                    <PressableScale
                      pressEffect="opacity"
                      onPress={() => setOpenComments((o) => new Set(o).add(i.key))}
                      style={styles.addComment}
                      accessibilityRole="button"
                      testID={`review-add-comment-${i.key}`}
                    >
                      <MaterialCommunityIcons name="comment-text-outline" size={18} color={colors.link} />
                      <Text style={styles.addCommentText}>{t('review.addComment')}</Text>
                    </PressableScale>
                  ) : null}
                  {commentOpen ? (
                    <TextInput
                      style={styles.input}
                      value={d.comment}
                      onChangeText={(text) => setThingComment(i.key, text)}
                      placeholder={t('review.thingPlaceholder')}
                      placeholderTextColor={colors.textTertiary}
                      maxLength={COMMENT_MAX}
                      multiline
                      autoFocus={!d.comment}
                      accessibilityLabel={t('review.thingCommentA11y', { name })}
                      testID={`review-comment-${i.key}`}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {saved && !dirty ? (
          <View style={styles.saved} testID="review-saved" accessibilityLiveRegion="polite">
            <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
            <Text style={styles.savedText}>{t('review.saved')}</Text>
          </View>
        ) : null}
        <Button label={t('review.save')} onPress={save} loading={saving} disabled={!dirty || saving} haptic="medium" testID="review-save" />
      </View>
    </View>
  );
}

/** Good 👍 / Bad 👎 as a labelled pair of radio buttons; the chosen one tapped again clears it */
function Verdicts({ name, value, onChoose, testKey }: { name: string; value: Verdict | null; onChoose: (v: Verdict) => void; testKey: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const c = reviewColors(theme);
  const { t } = useTranslation();
  const option = (v: Verdict, emoji: string) => {
    const on = value === v;
    const fill = v === 'good' ? c.good : c.bad;
    const ink = v === 'good' ? c.onGood : c.onBad;
    return (
      <PressableScale
        haptic="selection"
        onPress={() => onChoose(v)}
        style={[styles.choice, on && { backgroundColor: fill, borderColor: ink }]}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={t(`review.${v}`)}
        accessibilityHint={on ? t('review.clearHint') : undefined}
        testID={`review-${v}-${testKey}`}
      >
        <Text style={styles.emoji} importantForAccessibility="no">
          {emoji}
        </Text>
        <Text style={[styles.choiceText, on && { color: ink }]}>{t(`review.${v}`)}</Text>
      </PressableScale>
    );
  };
  return (
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={t('review.verdictA11y', { name })}>
      {option('good', '👍')}
      {option('bad', '👎')}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl },
  content: { padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: 120 },
  message: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center' },
  card: { backgroundColor: t.colors.surface, borderRadius: 20, padding: 18, gap: 10 },
  title: { ...t.type.title, color: t.colors.textPrimary },
  muted: { ...t.type.footnote, color: t.colors.textSecondary },
  hint: { ...t.type.footnote, color: t.colors.textSecondary, marginTop: -4 },
  input: {
    ...t.type.body,
    color: t.colors.textPrimary,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  markAll: { flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' },
  section: { gap: t.spacing.sm, marginTop: t.spacing.sm },
  sectionTitle: { ...t.type.headline, color: t.colors.textPrimary },
  row: { backgroundColor: t.colors.surface, borderRadius: 16, padding: t.spacing.md, gap: t.spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: t.colors.textPrimary },
  choices: { flexDirection: 'row', gap: t.spacing.sm },
  choice: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceInset,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emoji: { fontSize: 18 },
  choiceText: { ...t.type.callout, fontWeight: '600', color: t.colors.textSecondary },
  addComment: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  addCommentText: { ...t.type.callout, color: t.colors.link },
  error: { ...t.type.callout, color: t.colors.danger },
  footer: {
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.sm,
    gap: t.spacing.sm,
    backgroundColor: t.colors.bg,
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
  },
  saved: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  savedText: { ...t.type.callout, color: t.colors.textSecondary },
}));
