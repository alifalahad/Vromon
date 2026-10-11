/**
 * Trip feedback: 1–5 rating, tags and an optional comment. Loads any saved
 * feedback so the user sees what they submitted before.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FEEDBACK_TAGS } from '../constants/trip';
import { tripsApi } from '../services/api';
import { colors } from '../theme';
import type { Feedback } from '../types';

export function FeedbackForm({ tripId }: { tripId: number }) {
  const { data: saved, isLoading } = useQuery({
    queryKey: ['feedback', tripId],
    queryFn: () => tripsApi.getFeedback(tripId),
  });
  if (isLoading) return <ActivityIndicator color={colors.primaryText} />;
  // Keyed so the fields re-initialise when saved feedback (re)loads
  return <FeedbackFields key={saved ? `${saved.id}-${saved.created_at}` : 'new'} tripId={tripId} saved={saved ?? null} />;
}

function FeedbackFields({ tripId, saved }: { tripId: number; saved: Feedback | null }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(saved?.rating ?? 0);
  const [tags, setTags] = useState<string[]>(saved?.tags ?? []);
  const [comment, setComment] = useState(saved?.comment ?? '');
  const [justSaved, setJustSaved] = useState(false);

  const submit = useMutation({
    mutationFn: () => tripsApi.submitFeedback(tripId, rating, tags, comment.trim() || undefined),
    onSuccess: () => {
      setJustSaved(true);
      queryClient.invalidateQueries({ queryKey: ['feedback', tripId] });
    },
  });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>⭐ How was this plan?</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`Rate ${n} stars`} hitSlop={6}>
            <Text style={[styles.star, n <= rating && styles.starOn]}>★</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.tags}>
        {FEEDBACK_TAGS.map((t) => {
          const on = tags.includes(t);
          return (
            <Pressable
              key={t}
              onPress={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
              style={[styles.tag, on && styles.tagOn]}
            >
              <Text style={[styles.tagText, on && styles.tagTextOn]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Anything else? (optional)"
        placeholderTextColor={colors.textDim}
        value={comment}
        onChangeText={setComment}
        multiline
      />
      <Pressable
        style={[styles.btn, (rating === 0 || submit.isPending) && styles.btnDisabled]}
        disabled={rating === 0 || submit.isPending}
        onPress={() => submit.mutate()}
      >
        {submit.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{saved ? 'Update feedback' : 'Submit feedback'}</Text>}
      </Pressable>
      {(submit.isSuccess || justSaved) && <Text style={styles.ok}>Thanks! Feedback saved.</Text>}
      {submit.isError && <Text style={styles.err}>{(submit.error as Error).message}</Text>}
      {rating === 0 && <Text style={styles.hint}>Tap a star to rate.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontWeight: '800', fontSize: 16 },
  stars: { flexDirection: 'row', gap: 8 },
  star: { fontSize: 30, color: colors.border },
  starOn: { color: colors.warning },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  tagOn: { backgroundColor: '#0F3460', borderColor: '#1D4ED8' },
  tagText: { color: colors.textDim, fontSize: 12 },
  tagTextOn: { color: colors.primaryText, fontWeight: '600' },
  input: { backgroundColor: colors.bg, color: colors.text, borderRadius: 10, padding: 12, minHeight: 64, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' },
  btn: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700' },
  ok: { color: colors.success, fontSize: 12 },
  err: { color: colors.danger, fontSize: 12 },
  hint: { color: colors.textDim, fontSize: 12 },
});
