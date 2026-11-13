/**
 * "How was your trip?" at the bottom of the plan, from the trip's first day (trip upgrades step 7, D7).
 * One tap on a star saves it. Then a short summary with Edit (the stars and an optional comment) and
 * "Rate things one by one". Yours only (D9); the owner and each trip-room member rate on their own (D8).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';

import { tripsApi } from '../../../services/api';
import type { Trip, TripReviewIn } from '../../../types';
import { Button } from '../../../ui/Button';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { localToday } from '../dates';
import { usePlanFormat } from '../plan/usePlanFormat';
import { draftOf, ratedCount } from './review';
import { Stars, starWord } from './Stars';

const COMMENT_MAX = 280;

export function reviewKey(tripId: number) {
  return ['review', tripId] as const;
}

export function TripReviewCard({ trip }: { trip: Trip }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = localToday();
  const review = useQuery({ queryKey: reviewKey(trip.id), queryFn: () => tripsApi.review(trip.id, today) });
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const save = useMutation({
    mutationFn: (body: TripReviewIn) => tripsApi.saveReview(trip.id, body, today),
    onSuccess: (data) => {
      haptics.success();
      queryClient.setQueryData(reviewKey(trip.id), data);
      setEditing(false);
    },
    onError: () => haptics.error(),
  });

  // Not this traveller's to rate (a friend reading the trip), or not open yet: nothing to show
  if (!review.data) return null;
  const saved = review.data.review;
  const stars = saved?.rating ?? 0;
  const rated = ratedCount(draftOf(review.data.items));
  const openOneByOne = () => router.push({ pathname: '/trip/review/[id]', params: { id: trip.id } });
  const startEditing = () => {
    setRating(stars);
    setComment(saved?.comment ?? '');
    setEditing(true);
  };

  return (
    <View style={styles.card} testID="trip-review-card">
      <View style={styles.header}>
        <View style={styles.badge}>
          <MaterialCommunityIcons name={stars ? 'heart' : 'heart-outline'} size={22} color={colors.link} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {t('review.title')}
          </Text>
          <Text style={styles.subtitle}>{stars ? t('review.private') : t('review.oneTap')}</Text>
        </View>
        {stars && !editing ? (
          <PressableScale
            onPress={startEditing}
            style={styles.edit}
            accessibilityRole="button"
            accessibilityLabel={t('review.editA11y')}
            testID="trip-review-edit"
          >
            <Text style={styles.editText}>{t('review.edit')}</Text>
          </PressableScale>
        ) : null}
      </View>

      {!stars ? (
        // Not rated yet: one tap saves
        <Stars value={0} onChange={(n) => save.mutate({ rating: n })} label={t('review.starsA11y')} testID="trip-review-star" />
      ) : editing ? (
        <View style={styles.form}>
          <Stars value={rating} onChange={setRating} label={t('review.starsA11y')} testID="trip-review-edit-star" />
          <Text style={styles.word}>{starWord(rating, t)}</Text>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder={t('review.commentPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            maxLength={COMMENT_MAX}
            multiline
            accessibilityLabel={t('review.commentLabel')}
            testID="trip-review-comment"
          />
          <View style={styles.buttons}>
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setEditing(false)} testID="trip-review-cancel" />
            <Button
              label={t('review.save')}
              onPress={() => save.mutate({ rating, comment: comment.trim() || null })}
              loading={save.isPending}
              disabled={save.isPending}
              haptic="medium"
              testID="trip-review-save"
            />
          </View>
        </View>
      ) : (
        <View style={styles.summary} testID="trip-review-summary">
          <View style={styles.summaryRow}>
            <Stars value={stars} size={22} label={t('review.yourRating')} />
            <Text style={styles.word}>{starWord(stars, t)}</Text>
          </View>
          {saved?.comment ? <Text style={styles.comment}>“{saved.comment}”</Text> : null}
        </View>
      )}
      {save.isError ? <Text style={styles.error}>{t('review.failed')}</Text> : null}

      <PressableScale onPress={openOneByOne} pressEffect="opacity" style={styles.link} accessibilityRole="button" testID="trip-review-one-by-one">
        <MaterialCommunityIcons name="thumbs-up-down-outline" size={20} color={colors.link} />
        <Text style={styles.linkText}>{t('review.oneByOne')}</Text>
        {rated ? <Text style={styles.count}>{t('review.ratedCount', { count: rated, n: f.n(rated) })}</Text> : null}
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.link} />
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { backgroundColor: t.colors.surface, borderRadius: 20, padding: 18, gap: 14, borderWidth: 1, borderColor: t.colors.divider },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
  headerText: { flex: 1, gap: 2 },
  title: { ...t.type.headline, color: t.colors.textPrimary },
  subtitle: { ...t.type.footnote, color: t.colors.textSecondary },
  edit: { minHeight: 48, minWidth: 48, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  editText: { ...t.type.callout, color: t.colors.link, fontWeight: '600' },
  form: { gap: 10 },
  word: { ...t.type.callout, color: t.colors.textSecondary },
  input: {
    ...t.type.body,
    color: t.colors.textPrimary,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  buttons: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  summary: { gap: 6 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  comment: { ...t.type.callout, color: t.colors.textPrimary },
  error: { ...t.type.footnote, color: t.colors.danger },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  linkText: { ...t.type.callout, color: t.colors.link, fontWeight: '600', flex: 1 },
  count: { ...t.type.footnote, color: t.colors.textSecondary },
}));
