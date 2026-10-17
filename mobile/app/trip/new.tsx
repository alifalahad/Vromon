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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { CitySearch } from '../../src/features/trips/CitySearch';
import { refreshTrips } from '../../src/features/trips/queries';
import { TRANSPORT_MODES } from '../../src/features/trips/transport';
import { destinationsApi, placesApi, tripsApi } from '../../src/services/api';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { formatBDT, nightsBetween, plural } from '../../src/utils/format';

export default function NewTripScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  // Set when arriving from a destination screen ("Plan a trip here")
  const params = useLocalSearchParams<{ destination?: string }>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [stepMsg, setStepMsg] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const innerRef = useRef<View>(null);
  const reveal = useMemo(() => ({ scrollRef, innerRef }), []);

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
      haptics.success();
      refreshTrips(queryClient, trip.id);
      // Back to the Trips tab, where the new trip appears under Upcoming
      router.dismissTo('/trips');
    },
    onError: () => haptics.error(),
  });

  const next = async () => {
    const ok = await trigger(STEP_FIELDS[step] as (keyof TripFormInput)[]);
    const cross = stepError(step, getValues());
    // Zod may already show the same cross-field message under a field; don't repeat it
    const shown = STEP_FIELDS[step].map((f) => getFieldState(f as keyof TripFormInput).error?.message);
    setStepMsg(cross && !shown.includes(cross) ? cross : null);
    if (ok && !cross) setStep((s) => Math.min(s + 1, STEP_NAMES.length - 1));
    else haptics.error();
  };
  const back = () => {
    setStepMsg(null);
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };
  const submit = handleSubmit(
    (v) => create.mutate(v),
    (errors) => {
      haptics.error();
      setStep(firstStepWithError(Object.keys(errors)));
      setStepMsg('Please fix the highlighted field.');
    },
  );

  const err = (name: keyof TripFormInput) => formState.errors[name]?.message as string | undefined;
  const mustVisit = values.must_visit ?? [];
  const excluded = values.excluded_places ?? [];
  const placeName = (id: number) => places.data?.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    // Edge-to-edge Android doesn't resize the window for the keyboard: pad instead
    <KeyboardAvoidingView style={styles.container} behavior="padding">
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

      <ScrollView ref={scrollRef} innerViewRef={innerRef as React.RefObject<View>} style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <Step title="Where to?" hint="Destinations come from the Vromon database. Tap one to choose it.">
            {destinations.isLoading && <ActivityIndicator color={colors.link} />}
            {destinations.isError && <LoadError error={destinations.error} onRetry={() => destinations.refetch()} />}
            {destinations.data?.length === 0 && <Text style={styles.hint}>No destinations are available yet.</Text>}
            {destinations.data?.map((d) => (
              <PressableScale
                key={d.id}
                haptic="selection"
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
                {d.description ? (
                  <Text style={styles.optionBody} numberOfLines={2}>
                    {d.description}
                  </Text>
                ) : null}
                <PressableScale
                  pressEffect="opacity"
                  hitSlop={12}
                  style={styles.browseLink}
                  accessibilityLabel={`Browse places in ${d.name}`}
                  onPress={() => router.push({ pathname: '/destination/[id]', params: { id: d.id, from: 'wizard' } })}
                >
                  <Text style={styles.browseText}>Browse places ›</Text>
                </PressableScale>
              </PressableScale>
            ))}
            <FieldError message={err('destination')} />

            <Text style={styles.subTitle}>{t('trips.startingFrom')}</Text>
            {values.origin ? (
              <View style={[styles.option, styles.optionActive, styles.originRow]}>
                <Text style={[styles.optionTitle, styles.flex]}>{values.origin.label}</Text>
                <PressableScale
                  pressEffect="opacity"
                  hitSlop={8}
                  onPress={() => setValue('origin', null)}
                  accessibilityLabel={t('trips.removeStop')}
                  testID="origin-clear"
                >
                  <Text style={styles.browseText}>✕</Text>
                </PressableScale>
              </View>
            ) : (
              <CitySearch
                label={t('trips.stopSearch')}
                reveal={reveal}
                testID="origin-search"
                onPick={(city, country) => setValue('origin', { city_geonameid: city.geonameid, label: `${city.name}, ${country}` })}
              />
            )}

            <Text style={styles.subTitle}>{t('trips.gettingThere')}</Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {TRANSPORT_MODES.map(({ mode, icon }) => {
                const on = values.transport_mode === mode;
                return (
                  <PressableScale
                    key={mode}
                    haptic="selection"
                    style={[styles.modeChip, on && styles.modeChipOn]}
                    onPress={() => setValue('transport_mode', on ? null : mode)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    testID={`mode-${mode}`}
                  >
                    <MaterialCommunityIcons name={icon} size={20} color={on ? colors.onAccent : colors.textSecondary} />
                    <Text style={[styles.modeChipText, on && { color: colors.onAccent }]}>{t(`trips.modes.${mode}`)}</Text>
                  </PressableScale>
                );
              })}
            </View>
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
              <PressableScale
                key={p.value}
                style={[styles.option, Number(values.total_budget) === p.value && styles.optionActive]}
                onPress={() => setValue('total_budget', p.value, { shouldValidate: true })}
              >
                <Text style={styles.optionTitle}>{p.label}</Text>
                <Text style={styles.optionDesc}>{p.desc}</Text>
              </PressableScale>
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
                  <PressableScale
                    key={i}
                    haptic="selection"
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() =>
                      setValue('interests', on ? values.interests!.filter((x) => x !== i) : [...(values.interests ?? []), i], {
                        shouldValidate: true,
                      })
                    }
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{i}</Text>
                  </PressableScale>
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
                render={({ field }) => (
                  <Switch
                    accessibilityLabel="Avoid crowded places"
                    value={!!field.value}
                    onValueChange={(v) => {
                      haptics.selection();
                      field.onChange(v);
                    }}
                    trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
                    thumbColor={colors.onAccent}
                  />
                )}
              />
            </View>

            <Text style={styles.label}>Places: tap once for must-visit ★, twice to exclude ✕, again to clear</Text>
            {places.isLoading && <ActivityIndicator color={colors.link} />}
            {places.isError && <LoadError error={places.error} onRetry={() => places.refetch()} />}
            <View style={styles.chips}>
              {places.data?.map((p) => {
                const state = mustVisit.includes(p.id) ? 'must' : excluded.includes(p.id) ? 'exclude' : 'none';
                return (
                  <PressableScale
                    key={p.id}
                    haptic="selection"
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
                  </PressableScale>
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
            <Review label={t('trips.startingFrom')} value={values.origin?.label ?? '—'} />
            <Review label={t('trips.gettingThere')} value={values.transport_mode ? t(`trips.modes.${values.transport_mode}`) : '—'} />
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

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PressableScale style={styles.backBtn} onPress={back}>
          <Text style={styles.backText}>{step === 0 ? 'Cancel' : '← Back'}</Text>
        </PressableScale>
        {step < STEP_NAMES.length - 1 ? (
          <PressableScale haptic="medium" style={styles.nextBtn} onPress={next}>
            <Text style={styles.nextText}>Next →</Text>
          </PressableScale>
        ) : (
          <PressableScale
            haptic="medium"
            style={[styles.nextBtn, create.isPending && { opacity: 0.6 }]}
            disabled={create.isPending}
            onPress={submit}
            accessibilityRole="button"
            accessibilityLabel="Create trip"
            accessibilityState={{ disabled: create.isPending, busy: create.isPending }}
          >
            {create.isPending ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.nextText}>Create trip ✓</Text>}
          </PressableScale>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Step({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const styles = useStyles();
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
  const styles = useStyles();
  const { colors } = useTheme();
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
            placeholderTextColor={colors.textTertiary}
          />
        )}
      />
      <FieldError message={error} />
    </View>
  );
}

function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value?: T; onChange: (v: T) => void }) {
  const styles = useStyles();
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((o) => (
          <PressableScale
            key={o}
            haptic="selection"
            accessibilityRole="radio"
            accessibilityState={{ selected: value === o }}
            style={[styles.choice, value === o && styles.choiceOn]}
            onPress={() => onChange(o)}
          >
            <Text style={[styles.choiceText, value === o && styles.choiceTextOn]}>{o}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.loadError}>
      <Text style={styles.error}>⚠ {error instanceof Error ? error.message : 'Failed to load'}</Text>
      <PressableScale style={styles.retryBtn} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.retryText}>Retry</Text>
      </PressableScale>
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  const styles = useStyles();
  return message ? <Text style={styles.error}>⚠ {message}</Text> : null;
}

function Review({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  stepBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  dotText: { color: t.colors.onAccent, fontSize: 12, fontWeight: '700' },
  stepName: { color: t.colors.textTertiary, fontSize: 11, fontWeight: '600' },
  stepNameActive: { color: t.colors.link },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { color: t.colors.textPrimary, fontSize: 24, fontWeight: '800' },
  hint: { color: t.colors.textTertiary, fontSize: 13, lineHeight: 18 },
  label: { color: t.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: t.colors.surface, color: t.colors.textPrimary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: t.colors.border, fontSize: 15 },
  inputError: { borderColor: t.colors.danger },
  error: { color: t.colors.danger, fontSize: 13 },
  loadError: { gap: 8, alignItems: 'flex-start' },
  retryBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: t.colors.accent, backgroundColor: t.colors.surface },
  retryText: { color: t.colors.link, fontWeight: '600' },
  option: { backgroundColor: t.colors.surface, borderRadius: 20, padding: 16, gap: 2, borderWidth: 2, borderColor: 'transparent' },
  optionActive: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
  optionTitle: { color: t.colors.textPrimary, fontWeight: '700', fontSize: 15 },
  optionBody: { color: t.colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },
  browseLink: { alignSelf: 'flex-start', marginTop: 6, paddingVertical: 4 },
  browseText: { color: t.colors.link, fontSize: 13, fontWeight: '600' },
  optionDesc: { color: t.colors.textTertiary, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subTitle: { color: t.colors.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 16 },
  originRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 14, borderRadius: t.radius.chip, backgroundColor: t.colors.surface },
  modeChipOn: { backgroundColor: t.colors.accent },
  modeChipText: { color: t.colors.textSecondary, fontSize: 14, fontWeight: '600' },
  chip: { minHeight: 40, justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface },
  chipOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
  chipMust: { backgroundColor: t.colors.successBg, borderColor: t.colors.success },
  chipExclude: { backgroundColor: t.colors.dangerBg, borderColor: t.colors.danger },
  chipText: { color: t.colors.textSecondary, fontSize: 13 },
  chipTextOn: { color: t.colors.textPrimary, fontWeight: '600' },
  choiceRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choice: { minHeight: 40, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface },
  choiceOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  choiceText: { color: t.colors.textSecondary, fontWeight: '600' },
  choiceTextOn: { color: t.colors.onAccent },
  inlineFields: { flexDirection: 'row', gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  reviewLabel: { color: t.colors.textTertiary, width: 120, fontSize: 13 },
  reviewValue: { color: t.colors.textPrimary, flex: 1, fontSize: 13, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, backgroundColor: t.colors.bg },
  backBtn: { flex: 1, paddingVertical: 14, borderRadius: 999, alignItems: 'center', backgroundColor: t.colors.surface },
  backText: { color: t.colors.textSecondary, fontWeight: '600' },
  nextBtn: { flex: 2, paddingVertical: 14, borderRadius: 999, alignItems: 'center', backgroundColor: t.colors.accent },
  nextText: { color: t.colors.onAccent, fontWeight: '700', fontSize: 15 },
}));
