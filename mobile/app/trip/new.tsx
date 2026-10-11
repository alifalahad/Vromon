/**
 * Vromon Mobile — Plan-a-trip wizard (6 steps, as in the demo).
 *
 * 1 Where · 2 When & who · 3 Budget (presets) · 4 Interests & pace ·
 * 5 Daily schedule, must-visit / excluded places · 6 Review
 *
 * React Hook Form + Zod (src/features/tripForm.ts). Destinations and places come
 * from the backend; nothing is hard-coded except option lists the backend accepts.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ACCOMMODATION, ACTIVITY_LEVELS, BUDGET_PRESETS, INTERESTS, TRAVEL_STYLES } from '../../src/constants/trip';
import {
  cyclePlaceChoice,
  defaultTripForm,
  firstStepWithError,
  STEP_FIELDS,
  STEP_NAMES,
  stepError,
  toTripPayload,
  tripFormSchema,
  type TripFormInput,
  type TripFormValues,
} from '../../src/features/tripForm';
import { destinationsApi, placesApi, tripsApi } from '../../src/services/api';
import { colors } from '../../src/theme';
import { formatBDT, nightsBetween, plural } from '../../src/utils/format';

export default function NewTripScreen() {
  const router = useRouter();
  // Set when arriving from a destination screen ("Plan a trip here")
  const params = useLocalSearchParams<{ destination?: string }>();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [stepMsg, setStepMsg] = useState<string | null>(null);

  const { control, handleSubmit, trigger, setValue, getValues, getFieldState, formState } = useForm<
    TripFormInput,
    unknown,
    TripFormValues
  >({
    resolver: zodResolver(tripFormSchema),
    defaultValues: defaultTripForm(new Date(), params.destination ?? ''),
    mode: 'onTouched',
  });
  // useWatch (not watch()) is compatible with the React Compiler
  const values = useWatch({ control }) as TripFormInput;

  const destinations = useQuery({ queryKey: ['destinations'], queryFn: destinationsApi.list });
  const places = useQuery({
    queryKey: ['places', values.destination],
    queryFn: () => placesApi.list({ destination: values.destination }),
    enabled: !!values.destination,
  });

  const create = useMutation({
    mutationFn: (v: TripFormValues) => tripsApi.create(toTripPayload(v)),
    onSuccess: (trip) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      router.replace({ pathname: '/trip/[id]', params: { id: trip.id, created: '1' } });
    },
  });

  const next = async () => {
    const ok = await trigger(STEP_FIELDS[step] as (keyof TripFormInput)[]);
    const cross = stepError(step, getValues());
    // Zod may already show the same cross-field message under a field; don't repeat it
    const shown = STEP_FIELDS[step].map((f) => getFieldState(f as keyof TripFormInput).error?.message);
    setStepMsg(cross && !shown.includes(cross) ? cross : null);
    if (ok && !cross) setStep((s) => Math.min(s + 1, STEP_NAMES.length - 1));
  };
  const back = () => {
    setStepMsg(null);
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };
  const submit = handleSubmit(
    (v) => create.mutate(v),
    (errors) => {
      setStep(firstStepWithError(Object.keys(errors)));
      setStepMsg('Please fix the highlighted field.');
    },
  );

  const err = (name: keyof TripFormInput) => formState.errors[name]?.message as string | undefined;
  const mustVisit = values.must_visit ?? [];
  const excluded = values.excluded_places ?? [];
  const placeName = (id: number) => places.data?.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <View style={styles.container}>
      <View style={styles.stepBar}>
        {STEP_NAMES.map((name, i) => (
          <View key={name} style={styles.stepItem}>
            <View style={[styles.dot, i <= step && styles.dotActive]}>
              <Text style={styles.dotText}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepName, i === step && styles.stepNameActive]}>{name}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <Step title="Where to?" hint="Destinations come from the Vromon database">
            {destinations.isLoading && <ActivityIndicator color={colors.primaryText} />}
            {destinations.isError && <LoadError error={destinations.error} onRetry={() => destinations.refetch()} />}
            {destinations.data?.length === 0 && <Text style={styles.hint}>No destinations are available yet.</Text>}
            {destinations.data?.map((d) => (
              <Pressable
                key={d.id}
                style={[styles.option, values.destination === d.name && styles.optionActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: values.destination === d.name }}
                onPress={() => {
                  setValue('destination', d.name, { shouldValidate: true });
                  setValue('must_visit', []);
                  setValue('excluded_places', []);
                }}
              >
                <Text style={styles.optionTitle}>📍 {d.name}</Text>
                <Text style={styles.optionDesc}>{d.place_count ?? 0} places · {d.country}</Text>
              </Pressable>
            ))}
            <FieldError message={err('destination')} />
          </Step>
        )}

        {step === 1 && (
          <Step title="When & who?" hint="Dates as YYYY-MM-DD">
            <TextField control={control} name="start_date" label="Start date" error={err('start_date')} />
            <TextField control={control} name="end_date" label="End date" error={err('end_date')} />
            <TextField control={control} name="num_travelers" label="Travellers" numeric error={err('num_travelers')} />
          </Step>
        )}

        {step === 2 && (
          <Step title="Budget" hint="Total for the whole group, in BDT">
            {BUDGET_PRESETS.map((p) => (
              <Pressable
                key={p.value}
                style={[styles.option, Number(values.total_budget) === p.value && styles.optionActive]}
                onPress={() => setValue('total_budget', p.value, { shouldValidate: true })}
              >
                <Text style={styles.optionTitle}>{p.label}</Text>
                <Text style={styles.optionDesc}>{p.desc}</Text>
              </Pressable>
            ))}
            <TextField control={control} name="total_budget" label="Or enter your own total" numeric error={err('total_budget')} />
            <TextField
              control={control}
              name="max_daily_budget"
              label="Daily spending cap per person (0 = no cap)"
              numeric
              error={err('max_daily_budget')}
            />
            <Text style={styles.hint}>The cap covers activities and meals per person per day and is enforced as a hard limit.</Text>
          </Step>
        )}

        {step === 3 && (
          <Step title="Interests & pace" hint="Pick what you enjoy; the ranking uses these">
            <View style={styles.chips}>
              {INTERESTS.map((i) => {
                const on = values.interests?.includes(i);
                return (
                  <Pressable
                    key={i}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() =>
                      setValue('interests', on ? values.interests!.filter((x) => x !== i) : [...(values.interests ?? []), i], {
                        shouldValidate: true,
                      })
                    }
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{i}</Text>
                  </Pressable>
                );
              })}
            </View>
            <FieldError message={err('interests')} />
            <Choice label="Travel pace" options={TRAVEL_STYLES} value={values.travel_style} onChange={(v) => setValue('travel_style', v)} />
            <Choice label="Activity level" options={ACTIVITY_LEVELS} value={values.activity_level} onChange={(v) => setValue('activity_level', v)} />
            <Choice label="Accommodation" options={ACCOMMODATION} value={values.accommodation_preference} onChange={(v) => setValue('accommodation_preference', v)} />
          </Step>
        )}

        {step === 4 && (
          <Step title="Daily schedule" hint="Times in 24-hour HH:MM">
            <View style={styles.inlineFields}>
              <View style={{ flex: 1 }}>
                <TextField control={control} name="preferred_start_time" label="Day starts" error={err('preferred_start_time')} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField control={control} name="preferred_end_time" label="Day ends" error={err('preferred_end_time')} />
              </View>
            </View>
            <TextField control={control} name="max_activities_per_day" label="Max activities per day (1–10)" numeric error={err('max_activities_per_day')} />
            <View style={styles.switchRow}>
              <Text style={styles.label}>Avoid crowded places</Text>
              <Controller
                control={control}
                name="avoid_crowded"
                render={({ field }) => <Switch value={!!field.value} onValueChange={field.onChange} />}
              />
            </View>

            <Text style={styles.label}>Places: tap once for must-visit ★, twice to exclude ✕, again to clear</Text>
            {places.isLoading && <ActivityIndicator color={colors.primaryText} />}
            {places.isError && <LoadError error={places.error} onRetry={() => places.refetch()} />}
            <View style={styles.chips}>
              {places.data?.map((p) => {
                const state = mustVisit.includes(p.id) ? 'must' : excluded.includes(p.id) ? 'exclude' : 'none';
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.chip, state === 'must' && styles.chipMust, state === 'exclude' && styles.chipExclude]}
                    onPress={() => {
                      const r = cyclePlaceChoice(p.id, mustVisit, excluded);
                      setValue('must_visit', r.must_visit);
                      setValue('excluded_places', r.excluded_places);
                    }}
                    accessibilityLabel={`${p.name}: ${state}`}
                  >
                    <Text style={[styles.chipText, state !== 'none' && styles.chipTextOn]}>
                      {state === 'must' ? '★ ' : state === 'exclude' ? '✕ ' : ''}{p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Must-visit places are guaranteed by the optimizer when they fit opening hours and your day; otherwise it tells you why.
            </Text>
          </Step>
        )}

        {step === 5 && (
          <Step title="Review" hint="Check everything before creating the trip">
            <Review label="Destination" value={values.destination} />
            <Review
              label="Dates"
              value={`${values.start_date} → ${values.end_date} (${plural(nightsBetween(values.start_date, values.end_date), 'night')})`}
            />
            <Review label="Travellers" value={String(values.num_travelers)} />
            <Review label="Budget" value={formatBDT(Number(values.total_budget) || 0)} />
            <Review label="Daily cap / person" value={Number(values.max_daily_budget) ? formatBDT(Number(values.max_daily_budget)) : 'None'} />
            <Review label="Interests" value={(values.interests ?? []).join(', ') || '—'} />
            <Review label="Pace" value={`${values.travel_style} · ${values.activity_level} activity · ${values.accommodation_preference} stay`} />
            <Review label="Day" value={`${values.preferred_start_time}–${values.preferred_end_time}, up to ${values.max_activities_per_day} activities`} />
            <Review label="Avoid crowds" value={values.avoid_crowded ? 'Yes' : 'No'} />
            <Review label="Must-visit" value={mustVisit.map(placeName).join(', ') || 'None'} />
            <Review label="Excluded" value={excluded.map(placeName).join(', ') || 'None'} />
            {create.isError && (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                ⚠ The trip was not saved. Your answers are kept, so you can fix them and try again.{'\n'}
                {(create.error as Error).message}
              </Text>
            )}
          </Step>
        )}

        {stepMsg && <Text style={styles.error}>⚠ {stepMsg}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.backBtn} onPress={back}>
          <Text style={styles.backText}>{step === 0 ? 'Cancel' : '← Back'}</Text>
        </Pressable>
        {step < STEP_NAMES.length - 1 ? (
          <Pressable style={styles.nextBtn} onPress={next}>
            <Text style={styles.nextText}>Next →</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.nextBtn, create.isPending && { opacity: 0.6 }]}
            disabled={create.isPending}
            onPress={submit}
            accessibilityRole="button"
            accessibilityLabel="Create trip"
            accessibilityState={{ disabled: create.isPending, busy: create.isPending }}
          >
            {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextText}>Create trip ✓</Text>}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Step({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {children}
    </View>
  );
}

function TextField({
  control,
  name,
  label,
  numeric,
  error,
}: {
  control: ReturnType<typeof useForm<TripFormInput, unknown, TripFormValues>>['control'];
  name: keyof TripFormInput;
  label: string;
  numeric?: boolean;
  error?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={String(field.value ?? '')}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType={numeric ? 'numeric' : 'default'}
            autoCapitalize="none"
            placeholderTextColor={colors.textDim}
          />
        )}
      />
      <FieldError message={error} />
    </View>
  );
}

function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value?: T; onChange: (v: T) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((o) => (
          <Pressable key={o} style={[styles.choice, value === o && styles.choiceOn]} onPress={() => onChange(o)}>
            <Text style={[styles.choiceText, value === o && styles.choiceTextOn]}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={styles.loadError}>
      <Text style={styles.error}>⚠ {error instanceof Error ? error.message : 'Failed to load'}</Text>
      <Pressable style={styles.retryBtn} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <Text style={styles.error}>⚠ {message}</Text> : null;
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  stepBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.card },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepName: { color: '#475569', fontSize: 10, fontWeight: '600' },
  stepNameActive: { color: colors.primaryText },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  hint: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13 },
  loadError: { gap: 8, alignItems: 'flex-start' },
  retryBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card },
  retryText: { color: colors.primaryText, fontWeight: '600' },
  option: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 2 },
  optionActive: { borderColor: colors.primary, backgroundColor: '#0F3460' },
  optionTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  optionDesc: { color: colors.textDim, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { backgroundColor: '#0F3460', borderColor: '#1D4ED8' },
  chipMust: { backgroundColor: colors.successBg, borderColor: colors.success },
  chipExclude: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextOn: { color: colors.text, fontWeight: '600' },
  choiceRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choice: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  choiceOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.textMuted, fontWeight: '600' },
  choiceTextOn: { color: '#fff' },
  inlineFields: { flexDirection: 'row', gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewRow: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.card },
  reviewLabel: { color: colors.textDim, width: 120, fontSize: 13 },
  reviewValue: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: colors.card },
  backBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  backText: { color: colors.textMuted, fontWeight: '600' },
  nextBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primary },
  nextText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
