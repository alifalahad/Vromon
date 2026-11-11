/**
 * Rate this plan: five stars with a word for each (Poor … Excellent); once rated, what worked
 * and what to improve (the stored tags, shown translated and in two groups), and an optional
 * note. Saved feedback shows as a short summary with Edit.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { tripsApi } from '../services/api';
import type { Feedback } from '../types';
import { haptics } from '../ui/haptics';
import { PressableScale } from '../ui/PressableScale';
import { makeStyles, useTheme } from '../ui/theme';

// The tag values the server stores, by group, with their translation keys
const WORKED = [
  ['Great places', 'places'],
  ['Good pacing', 'pacing'],
  ['Good value', 'value'],
  ['Great food', 'food'],
] as const;
const IMPROVE = [
  ['Too rushed', 'rushed'],
  ['Too slow', 'slow'],
  ['Over budget', 'budget'],
  ['Too much travel', 'travel'],
] as const;
const WORDS = ['', 'poor', 'fair', 'good', 'veryGood', 'excellent'] as const;

export function FeedbackForm({ tripId }: { tripId: number }) {
  const { colors } = useTheme();
  const { data: saved, isLoading } = useQuery({
    queryKey: ['feedback', tripId],
    queryFn: () => tripsApi.getFeedback(tripId),
  });
  if (isLoading) return <ActivityIndicator color={colors.link} />;
  // Keyed so the fields re-initialise when saved feedback (re)loads
  return <FeedbackFields key={saved ? `${saved.id}-${saved.created_at}` : 'new'} tripId={tripId} saved={saved ?? null} />;
}

function FeedbackFields({ tripId, saved }: { tripId: number; saved: Feedback | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(!saved);
  const [rating, setRating] = useState(saved?.rating ?? 0);
  const [tags, setTags] = useState<string[]>(saved?.tags ?? []);
  const [comment, setComment] = useState(saved?.comment ?? '');

  const submit = useMutation({
    mutationFn: () => tripsApi.submitFeedback(tripId, rating, tags, comment.trim() || undefined),
    onSuccess: () => {
      haptics.success();
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['feedback', tripId] });
    },
    onError: () => haptics.error(),
  });

  const toggle = (tag: string) => setTags(tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag]);
  const stars = (value: number, size: number, onPick?: (n: number) => void) => (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <MaterialCommunityIcons name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.warning : colors.textTertiary} />;
        return onPick ? (
          <PressableScale
            key={n}
            haptic="selection"
            onPress={() => onPick(n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: n === value }}
            accessibilityLabel={t('feedback.starLabel', { n, word: t(`feedback.words.${WORDS[n]}`) })}
            hitSlop={6}
            testID={`feedback-star-${n}`}
          >
            {icon}
          </PressableScale>
        ) : (
          <View key={n}>{icon}</View>
        );
      })}
    </View>
  );

  if (saved && !editing) {
    const shown = [...WORKED, ...IMPROVE].filter(([v]) => saved.tags.includes(v));
    return (
      <View style={styles.card} testID="feedback-summary">
        <View style={styles.header}>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="check-decagram" size={22} color={colors.success} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('feedback.thanks')}</Text>
            <View style={styles.summaryRow}>
              {stars(saved.rating, 18)}
              <Text style={styles.word}>{t(`feedback.words.${WORDS[saved.rating]}`)}</Text>
            </View>
          </View>
          <PressableScale onPress={() => setEditing(true)} style={styles.edit} accessibilityLabel={t('feedback.edit')} testID="feedback-edit">
            <Text style={styles.editText}>{t('feedback.edit')}</Text>
          </PressableScale>
        </View>
        {shown.length ? <Text style={styles.summaryTags}>{shown.map(([, k]) => t(`feedback.tags.${k}`)).join(' · ')}</Text> : null}
        {saved.comment ? <Text style={styles.summaryComment}>“{saved.comment}”</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.card} testID="feedback-form">
      <View style={styles.header}>
        <View style={styles.badge}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={22} color={colors.link} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {t('feedback.title')}
          </Text>
          <Text style={styles.subtitle}>{t('feedback.subtitle')}</Text>
        </View>
      </View>

      <View style={styles.rating}>
        {stars(rating, 38, setRating)}
        <Text style={[styles.word, !rating && styles.wordHint]}>{rating ? t(`feedback.words.${WORDS[rating]}`) : t('feedback.tapStar')}</Text>
      </View>

      {rating ? (
        <>
          <Group title={t('feedback.worked')} icon="thumb-up-outline" options={WORKED} tags={tags} onToggle={toggle} tone="good" />
          <Group title={t('feedback.improve')} icon="tune-variant" options={IMPROVE} tags={tags} onToggle={toggle} tone="bad" />
          <Text style={styles.label}>{t('feedback.noteLabel')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('feedback.notePlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            accessibilityLabel={t('feedback.noteLabel')}
          />
          <PressableScale
            haptic="medium"
            style={[styles.btn, submit.isPending && styles.btnDisabled]}
            disabled={submit.isPending}
            onPress={() => submit.mutate()}
            testID="feedback-submit"
          >
            {submit.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.btnText}>{saved ? t('feedback.update') : t('feedback.submit')}</Text>
            )}
          </PressableScale>
          {submit.isError ? <Text style={styles.err}>{t('feedback.failed')}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

function Group({
  title,
  icon,
  options,
  tags,
  onToggle,
  tone,
}: {
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  options: readonly (readonly [string, string])[];
  tags: string[];
  onToggle: (tag: string) => void;
  tone: 'good' | 'bad';
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.group}>
      <View style={styles.groupTitleRow}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.textSecondary} />
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      <View style={styles.chips}>
        {options.map(([value, key]) => {
          const on = tags.includes(value);
          return (
            <PressableScale
              key={value}
              haptic="selection"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => onToggle(value)}
              style={[styles.chip, on && (tone === 'good' ? styles.chipGood : styles.chipBad)]}
            >
              {on ? <MaterialCommunityIcons name="check" size={15} color={tone === 'good' ? colors.success : colors.warning} /> : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(`feedback.tags.${key}`)}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { backgroundColor: t.colors.surface, borderRadius: 20, padding: 18, gap: 16, borderWidth: 1, borderColor: t.colors.divider },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
  headerText: { flex: 1, gap: 2 },
  title: { ...t.type.headline, color: t.colors.textPrimary },
  subtitle: { ...t.type.footnote, color: t.colors.textSecondary },
  rating: { alignItems: 'center', gap: 6, paddingVertical: 4 },
  stars: { flexDirection: 'row', gap: 6 },
  word: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  wordHint: { fontWeight: '400', color: t.colors.textTertiary },
  group: { gap: 8 },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  chipGood: { borderColor: t.colors.success, backgroundColor: t.colors.successBg },
  chipBad: { borderColor: t.colors.warning, backgroundColor: t.colors.warningBg },
  chipText: { ...t.type.footnote, color: t.colors.textSecondary },
  chipTextOn: { color: t.colors.textPrimary, fontWeight: '600' },
  label: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary, marginBottom: -8 },
  input: {
    backgroundColor: t.colors.bg,
    color: t.colors.textPrimary,
    borderRadius: 14,
    padding: 12,
    minHeight: 72,
    borderWidth: 1,
    borderColor: t.colors.border,
    textAlignVertical: 'top',
    ...t.type.callout,
  },
  btn: { backgroundColor: t.colors.accentStrong, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { ...t.type.headline, color: t.colors.onAccent },
  err: { ...t.type.footnote, color: t.colors.danger, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  edit: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
  editText: { ...t.type.footnote, fontWeight: '700', color: t.colors.link },
  summaryTags: { ...t.type.footnote, color: t.colors.textSecondary },
  summaryComment: { ...t.type.callout, fontStyle: 'italic', color: t.colors.textSecondary },
}));
