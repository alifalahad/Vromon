/**
 * "Your trip" (docs/ui-refresh step 16, frame 33), at the top of a finished trip's plan in the hero colour: its
 * days, its places (the plan's stops that are places) and the kilometres on the road there (the plan's rides,
 * from and back to the stay included). Under them your rating: not rated yet, one tap on a star saves it (as
 * on the trip); then the stars, their word and Edit (the stars and an optional comment), and "Rate things one
 * by one" with how many are rated. Yours only (D9): the owner and each trip-room member rate on their own.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';

import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat } from '../plan/usePlanFormat';
import { Stars, starWord } from '../review/Stars';
import { useTripReview } from '../review/TripReviewCard';
import type { Recap } from './recap';

const COMMENT_MAX = 280;

export function TripRecap({ tripId, numbers }: { tripId: number; numbers: Recap }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const { data, saved, stars, rated, save } = useTripReview(tripId);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const figures = [
    { key: 'days', value: f.n(numbers.days), label: t('after.days', { count: numbers.days }) },
    numbers.places != null ? { key: 'places', value: f.n(numbers.places), label: t('after.places', { count: numbers.places }) } : null,
    numbers.km != null ? { key: 'km', value: t('after.km', { km: f.n(numbers.km) }), label: t('after.onTheRoad') } : null,
  ].filter((x): x is { key: string; value: string; label: string } => !!x);
  const openOneByOne = () => router.push({ pathname: '/trip/review/[id]', params: { id: tripId } });
  const startEditing = () => {
    setRating(stars);
    setComment(saved?.comment ?? '');
    setEditing(true);
  };

  return (
    <View style={styles.card} testID="trip-recap">
      <Text style={styles.label} maxFontSizeMultiplier={1.3}>
        {t('after.yourTrip')}
      </Text>
      <View style={styles.figures} accessible accessibilityLabel={figures.map((x) => `${x.value} ${x.label}`).join(', ')} testID="trip-recap-numbers">
        {figures.map((x) => (
          <View key={x.key} style={styles.figure}>
            <Text style={styles.value} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
              {x.value}
            </Text>
            <Text style={styles.figureLabel}>{x.label}</Text>
          </View>
        ))}
      </View>

      {/* Your rating, once it's loaded (it isn't shown to anyone who didn't go) */}
      {data ? (
        <View testID="trip-review-card">
          <View style={styles.rule} />
          {!stars ? (
            // Not rated yet: one tap saves
            <View style={styles.ask}>
              <Text style={styles.askTitle} accessibilityRole="header">
                {t('review.title')}
              </Text>
              <Stars
                value={0}
                onChange={(n) => save.mutate({ rating: n })}
                size={30}
                color={colors.highlight}
                emptyColor={colors.onHeroSecondary}
                label={t('review.starsA11y')}
                testID="trip-review-star"
              />
              <Text style={styles.second}>{t('review.reminderBody')}</Text>
            </View>
          ) : editing ? (
            <View style={styles.form}>
              <Stars
                value={rating}
                onChange={setRating}
                size={30}
                color={colors.highlight}
                emptyColor={colors.onHeroSecondary}
                label={t('review.starsA11y')}
                testID="trip-review-edit-star"
              />
              <Text style={styles.second}>{starWord(rating, t)}</Text>
              <TextInput
                style={styles.input}
                value={comment}
                onChangeText={setComment}
                placeholder={t('review.commentPlaceholder')}
                placeholderTextColor={colors.onHeroSecondary}
                maxLength={COMMENT_MAX}
                multiline
                accessibilityLabel={t('review.commentLabel')}
                testID="trip-review-comment"
              />
              <View style={styles.formButtons}>
                <PressableScale onPress={() => setEditing(false)} style={[styles.pill, styles.quiet]} accessibilityRole="button" testID="trip-review-cancel">
                  <Text style={styles.pillText}>{t('common.cancel')}</Text>
                </PressableScale>
                <PressableScale
                  haptic="medium"
                  onPress={() => save.mutate({ rating, comment: comment.trim() || null }, { onSuccess: () => setEditing(false) })}
                  disabled={save.isPending}
                  style={[styles.pill, styles.primary, save.isPending && styles.busy]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: save.isPending, busy: save.isPending }}
                  testID="trip-review-save"
                >
                  <Text style={styles.pillText}>{t('review.save')}</Text>
                </PressableScale>
              </View>
            </View>
          ) : (
            <View style={styles.summary} testID="trip-review-summary">
              <View style={styles.summaryText}>
                <Text style={styles.second}>{t('after.ratingLabel')}</Text>
                <View style={styles.starsRow}>
                  <Stars value={stars} size={26} gap={3} color={colors.highlight} emptyColor={colors.onHeroSecondary} label={t('review.yourRating')} />
                  <Text style={styles.word}>{starWord(stars, t)}</Text>
                </View>
                {saved?.comment ? <Text style={styles.comment}>“{saved.comment}”</Text> : null}
              </View>
              <PressableScale
                onPress={startEditing}
                style={[styles.pill, styles.quiet]}
                accessibilityRole="button"
                accessibilityLabel={t('review.editA11y')}
                testID="trip-review-edit"
              >
                <Text style={styles.pillText}>{t('review.edit')}</Text>
              </PressableScale>
            </View>
          )}
          {save.isError ? <Text style={styles.error}>{t('review.failed')}</Text> : null}

          <PressableScale onPress={openOneByOne} pressEffect="opacity" style={styles.link} accessibilityRole="button" testID="trip-review-one-by-one">
            <Text style={styles.linkText}>{t('review.oneByOne')}</Text>
            <View style={styles.linkEnd}>
              {rated ? <Text style={styles.count}>{t('review.ratedCount', { count: rated, n: f.n(rated) })}</Text> : null}
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onHeroSecondary} />
            </View>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // Frame 33: 16 inside, rounded 22, the hero colour
  card: { padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.hero },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: t.colors.highlight },
  figures: { flexDirection: 'row', gap: 8, marginTop: 8 },
  figure: { flex: 1, minWidth: 0 },
  value: { ...t.type.title, fontSize: 28, lineHeight: 32, color: t.colors.onHero },
  figureLabel: { fontSize: 12.5, color: t.colors.onHeroSecondary },
  rule: { height: 1, marginTop: 14, marginBottom: 12, backgroundColor: t.colors.heroLine },
  ask: { gap: 4 },
  askTitle: { fontSize: 15, fontWeight: '700', color: t.colors.onHero },
  second: { fontSize: 13, color: t.colors.onHeroSecondary },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryText: { flex: 1, gap: 5 },
  starsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 },
  word: { fontSize: 15, fontWeight: '700', color: t.colors.onHero },
  comment: { fontSize: 13.5, color: t.colors.onHero },
  form: { gap: 8 },
  input: {
    fontSize: 15,
    color: t.colors.onHero,
    borderWidth: 1,
    borderColor: t.colors.heroOutline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  formButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
  pill: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  quiet: { backgroundColor: t.colors.heroQuiet },
  primary: { backgroundColor: t.colors.accentStrong },
  busy: { opacity: 0.6 },
  pillText: { fontSize: 14.5, fontWeight: '500', color: t.colors.onHero },
  error: { fontSize: 13, marginTop: 6, color: t.colors.heroWarning },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, marginTop: 10 },
  linkText: { flex: 1, fontSize: 14.5, fontWeight: '500', color: t.colors.heroLink },
  linkEnd: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontSize: 13.5, color: t.colors.onHeroSecondary },
}));
