/**
 * Trip feedback: 1–5 rating, tags and an optional comment. Loads any saved
 * feedback so the user sees what they submitted before.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { FEEDBACK_TAGS } from '../constants/trip';
import { tripsApi } from '../services/api';
import { haptics } from '../ui/haptics';
import { PressableScale } from '../ui/PressableScale';
import { makeStyles, useTheme } from '../ui/theme';
import type { Feedback } from '../types';

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
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(saved?.rating ?? 0);
  const [tags, setTags] = useState<string[]>(saved?.tags ?? []);
  const [comment, setComment] = useState(saved?.comment ?? '');
  const [justSaved, setJustSaved] = useState(false);

  const submit = useMutation({
    mutationFn: () => tripsApi.submitFeedback(tripId, rating, tags, comment.trim() || undefined),
    onSuccess: () => {
      haptics.success();
      setJustSaved(true);
      queryClient.invalidateQueries({ queryKey: ['feedback', tripId] });
    },
    onError: () => haptics.error(),
  });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>⭐ How was this plan?</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <PressableScale key={n} haptic="selection" onPress={() => setRating(n)} accessibilityLabel={`Rate ${n} stars`} hitSlop={6}>
            <Text style={[styles.star, n <= rating && styles.starOn]}>★</Text>
          </PressableScale>
        ))}
      </View>
      <View style={styles.tags}>
        {FEEDBACK_TAGS.map((t) => {
          const on = tags.includes(t);
          return (
            <PressableScale
              key={t}
              haptic="selection"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
              style={[styles.tag, on && styles.tagOn]}
            >
              <Text style={[styles.tagText, on && styles.tagTextOn]}>{t}</Text>
            </PressableScale>
          );
        })}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Anything else? (optional)"
        placeholderTextColor={colors.textTertiary}
        value={comment}
        onChangeText={setComment}
        multiline
      />
      <PressableScale
        haptic="medium"
        style={[styles.btn, (rating === 0 || submit.isPending) && styles.btnDisabled]}
        disabled={rating === 0 || submit.isPending}
        onPress={() => submit.mutate()}
      >
        {submit.isPending ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.btnText}>{saved ? 'Update feedback' : 'Submit feedback'}</Text>}
      </PressableScale>
      {(submit.isSuccess || justSaved) && <Text style={styles.ok}>Thanks! Feedback saved.</Text>}
      {submit.isError && <Text style={styles.err}>{(submit.error as Error).message}</Text>}
      {rating === 0 && <Text style={styles.hint}>Tap a star to rate.</Text>}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { backgroundColor: t.colors.surface, borderRadius: 20, padding: 16, gap: 12 },
  title: { color: t.colors.textPrimary, fontWeight: '800', fontSize: 16 },
  stars: { flexDirection: 'row', gap: 8 },
  star: { fontSize: 30, color: t.colors.border },
  starOn: { color: t.colors.warning },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'transparent', backgroundColor: t.colors.surfaceInset },
  tagOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
  tagText: { color: t.colors.textSecondary, fontSize: 13 },
  tagTextOn: { color: t.colors.link, fontWeight: '600' },
  input: { backgroundColor: t.colors.bg, color: t.colors.textPrimary, borderRadius: 12, padding: 12, minHeight: 64, borderWidth: 1, borderColor: t.colors.border, textAlignVertical: 'top' },
  btn: { backgroundColor: t.colors.accent, paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: t.colors.onAccent, fontWeight: '700' },
  ok: { color: t.colors.success, fontSize: 12 },
  err: { color: t.colors.danger, fontSize: 12 },
  hint: { color: t.colors.textTertiary, fontSize: 12 },
}));
