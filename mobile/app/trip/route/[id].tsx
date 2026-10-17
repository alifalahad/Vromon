/**
 * Vromon Mobile — edit a trip's route (decision D7): the stops in order, how you
 * get to each, add a city, reorder, remove. Saved with PUT /trips/{id}/stops.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';

import { flagEmoji } from '../../../src/features/geo/countries';
import { CitySearch } from '../../../src/features/trips/CitySearch';
import { refreshTrips, tripKeys } from '../../../src/features/trips/queries';
import { TRANSPORT_MODES } from '../../../src/features/trips/transport';
import { tripsApi } from '../../../src/services/api';
import type { TransportMode, Trip } from '../../../src/types';
import { Button } from '../../../src/ui/Button';
import { haptics } from '../../../src/ui/haptics';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { notify } from '../../../src/utils/dialogs';

interface DraftStop {
  key: string;
  city_geonameid: number | null;
  country_iso2: string;
  label: string;
  transport_mode: TransportMode | null;
  arrive_on: string | null;
  depart_on: string | null;
}

let counter = 0;

function fromTrip(trip: Trip): DraftStop[] {
  return (trip.stops ?? []).map((s) => ({
    key: `stop-${++counter}`,
    city_geonameid: s.city_geonameid,
    country_iso2: s.country_iso2,
    label: s.city_name ? `${s.city_name}, ${s.country_name}` : s.country_name,
    transport_mode: s.transport_mode,
    arrive_on: s.arrive_on,
    depart_on: s.depart_on,
  }));
}

export default function RouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const trip = useQuery({ queryKey: tripKeys.trip(tripId), queryFn: () => tripsApi.get(tripId) });
  // The editor starts from the loaded trip; remount when it first arrives
  return trip.data ? <RouteEditor trip={trip.data} /> : null;
}

function RouteEditor({ trip }: { trip: Trip }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();
  const [stops, setStops] = useState<DraftStop[]>(() => fromTrip(trip));
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const innerRef = useRef<View>(null);
  const reveal = useMemo(() => ({ scrollRef, innerRef }), []);

  const update = (key: string, patch: Partial<DraftStop>) => setStops((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (index: number, by: -1 | 1) =>
    setStops((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });

  const save = async () => {
    if (!stops.length) {
      notify(t('trips.editRoute'), t('trips.routeNeedsStop'), 'error');
      return;
    }
    setSaving(true);
    try {
      await tripsApi.setStops(
        trip.id,
        stops.map(({ city_geonameid, country_iso2, transport_mode, arrive_on, depart_on }) => ({ city_geonameid, country_iso2, transport_mode, arrive_on, depart_on })),
      );
      haptics.success();
      refreshTrips(client, trip.id);
      router.back();
    } catch (err) {
      notify(t('common.error'), err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    // Edge-to-edge Android doesn't resize the window for the keyboard: pad instead
    <KeyboardAvoidingView style={styles.container} behavior="padding">
    <ScrollView
      ref={scrollRef}
      innerViewRef={innerRef as React.RefObject<View>}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="route-editor"
    >
      {stops.map((stop, i) => (
        <View key={stop.key} style={styles.stop} testID={`route-stop-${i}`}>
          <View style={styles.stopHeader}>
            <Text style={styles.flag}>{flagEmoji(stop.country_iso2)}</Text>
            <Text style={styles.stopName} numberOfLines={2}>
              {stop.label}
            </Text>
            <PressableScale
              style={styles.icon}
              haptic="warning"
              onPress={() => setStops((list) => list.filter((s) => s.key !== stop.key))}
              accessibilityLabel={t('trips.removeStop')}
              testID={`route-remove-${i}`}
            >
              <MaterialCommunityIcons name="close" size={22} color={colors.danger} />
            </PressableScale>
          </View>
          <View style={styles.captionRow}>
            <Text style={styles.caption}>{t('trips.gettingThere')}</Text>
            <PressableScale style={styles.icon} disabled={i === 0} onPress={() => move(i, -1)} accessibilityLabel={t('trips.moveUp')}>
              <MaterialCommunityIcons name="arrow-up" size={22} color={i === 0 ? colors.textTertiary : colors.textPrimary} />
            </PressableScale>
            <PressableScale style={styles.icon} disabled={i === stops.length - 1} onPress={() => move(i, 1)} accessibilityLabel={t('trips.moveDown')}>
              <MaterialCommunityIcons name="arrow-down" size={22} color={i === stops.length - 1 ? colors.textTertiary : colors.textPrimary} />
            </PressableScale>
          </View>
          <View style={styles.modes} accessibilityRole="radiogroup">
            {TRANSPORT_MODES.map(({ mode, icon }) => {
              const on = stop.transport_mode === mode;
              return (
                <PressableScale
                  key={mode}
                  haptic="selection"
                  style={[styles.mode, on && styles.modeOn]}
                  onPress={() => update(stop.key, { transport_mode: on ? null : mode })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t(`trips.modes.${mode}`)}
                  testID={`route-mode-${i}-${mode}`}
                >
                  <MaterialCommunityIcons name={icon} size={22} color={on ? colors.onAccent : colors.textSecondary} />
                </PressableScale>
              );
            })}
          </View>
        </View>
      ))}

      <CitySearch
        label={t('trips.addStop')}
        reveal={reveal}
        testID="route-search"
        onPick={(city, country) =>
          setStops((list) => [
            ...list,
            {
              key: `stop-${++counter}`,
              city_geonameid: city.geonameid,
              country_iso2: city.country_iso2,
              label: `${city.name}, ${country}`,
              transport_mode: null,
              arrive_on: null,
              depart_on: null,
            },
          ])
        }
      />

      <Button label={t('common.save')} onPress={save} loading={saving} disabled={saving} testID="route-save" />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.spacing.lg + 2, gap: t.spacing.lg, paddingBottom: 64 },
  stop: { backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.lg, gap: t.spacing.sm },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  flag: { fontSize: 28 },
  stopName: { ...t.type.headline, color: t.colors.textPrimary, flex: 1 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  captionRow: { flexDirection: 'row', alignItems: 'center' },
  caption: { ...t.type.footnote, color: t.colors.textSecondary, flex: 1 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  mode: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
  modeOn: { backgroundColor: t.colors.accent },
}));
