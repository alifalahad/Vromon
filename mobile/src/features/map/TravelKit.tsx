/**
 * What every "Your travels" list needs (docs/ui-refresh step 2): your marks and trips, names in
 * your language, the year a place was first visited, "Show on map" (the dashboard closes and the
 * map frames the place), and "Mark" with its sheet (Visited, Lived, Want). Also the list of a
 * country's regions, shared by the Divisions list and a country's page.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { resolveLanguage } from '../../i18n';
import type { PlaceType, Trip, Visit, VisitStatus } from '../../types';
import { OptionSheet } from '../../ui/OptionSheet';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { useMe } from '../account/useMe';
import { usePreferences, type Language } from '../preferences/store';
import { localToday, parseDay } from '../trips/dates';
import { useTrips } from '../trips/queries';
import { usePlanFormat } from '../trips/plan/usePlanFormat';
import { useMapRequest } from './mapRequest';
import { Card, EmptyList, TravelRow } from './TravelParts';
import { placeName, targetOf, useTravelPlaces, type PlaceLookup } from './travelPlaces';
import { beenDistricts, beenRegions, bundledDistricts, bundledRegions, firstYear, tripInto } from './travels';
import { useMarkPlace } from './useMarkPlace';
import { statusOf, useVisits, type PlaceRef } from './visits';

type Code = Pick<Visit, 'place_type' | 'place_code'>;

export type TravelKit = {
  lang: Language;
  visits: Visit[];
  trips: Trip[];
  lookup: PlaceLookup;
  today: string;
  /** The place's name, or "A city (its name loads with a connection)" */
  name: (v: Code) => string;
  /** "since 2003" (lived) or "first visited 2024", when the date is known */
  year: (v: Visit) => string | null;
  showOnMap: (v: Code) => void;
  /** A map button for a row, when the place can be framed */
  mapButton: (v: Code, label: string) => React.ReactNode;
  /** "Mark" for a place not marked yet */
  markButton: (p: PlaceRef & { name: string }) => React.ReactNode;
  /** The sheet "Mark" opens: render once on the screen */
  sheet: React.ReactNode;
};

export function useTravelKit(): TravelKit {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const { data: trips = [] } = useTrips();
  const { lookup } = useTravelPlaces(visits);
  const markPlace = useMarkPlace(me?.id ?? '', visits);
  const ask = useMapRequest((s) => s.ask);
  const [marking, setMarking] = useState<(PlaceRef & { name: string }) | null>(null);

  const name = (v: Code) => placeName(v, lang, lookup) ?? t('travels.nameNeedsConnection');
  const year = (v: Visit) => {
    const y = firstYear(v);
    if (!y) return null;
    return v.status === 'lived' ? t('travels.since', { year: f.n(y) }) : t('travels.firstVisited', { year: f.n(y) });
  };
  const showOnMap = (v: Code) => {
    const target = targetOf(v, lookup);
    if (!target) return;
    ask({ kind: 'show', target });
    router.dismissAll();
  };
  return {
    lang,
    visits,
    trips,
    lookup,
    today: localToday(),
    name,
    year,
    showOnMap,
    mapButton: (v, label) =>
      targetOf(v, lookup) ? <MapButton label={t('travels.showOnMapA11y', { name: label })} onPress={() => showOnMap(v)} testID={`show-${v.place_type}-${v.place_code}`} /> : null,
    markButton: (place) =>
      me ? (
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={() => setMarking(place)}
          style={styles.mark}
          accessibilityRole="button"
          accessibilityLabel={t('travels.markA11y', { name: place.name })}
          testID={`mark-${place.place_code}`}
        >
          <Text style={styles.markText}>{t('travels.mark')}</Text>
        </PressableScale>
      ) : null,
    sheet: (
      <OptionSheet<VisitStatus | 'none'>
        visible={!!marking}
        title={marking?.name ?? ''}
        options={[
          { value: 'visited', label: t('travels.status.visited') },
          { value: 'lived', label: t('travels.status.lived') },
          { value: 'want', label: t('travels.status.want') },
        ]}
        selected="none"
        onSelect={(status) => {
          if (marking && status !== 'none') markPlace(marking, status);
          setMarking(null);
        }}
        onClose={() => setMarking(null)}
      />
    ),
  };
}

/** The regions of a country: those you've been to, then the rest with Mark (frame 4). */
export function RegionList({ country, kit }: { country: string; kit: TravelKit }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const { visits, trips, today, name, year, mapButton, markButton } = kit;
  const been = beenRegions(visits, country);
  const rest = (bundledRegions(country) ?? []).filter((r) => !been.some((v) => v.place_code === r.code));
  const districtsOf = (code: string) => {
    const total = bundledDistricts(code).length;
    return total ? t('travels.districtsOf', { done: f.n(beenDistricts(visits, code).length), total: f.n(total) }) : null;
  };
  const open = (code: string) => router.push({ pathname: '/map/list/[kind]', params: { kind: 'region', region: code, country } });
  if (!been.length && !rest.length) {
    return (
      <EmptyList
        icon="view-grid-outline"
        title={t('travels.empty.regions.title')}
        body={t('travels.empty.regions.body')}
        action={t('travels.openMap')}
        onAction={() => router.dismissAll()}
        testID="travels-empty"
      />
    );
  }
  return (
    <>
      {been.length ? (
        <Card>
          {been.map((v, i) => (
            <TravelRow
              key={v.place_code}
              name={name(v)}
              sub={[t(`travels.status.${v.status}`), districtsOf(v.place_code), year(v)].filter(Boolean).join(' · ')}
              status={v.status}
              right={mapButton(v, name(v))}
              onPress={() => open(v.place_code)}
              last={i === been.length - 1}
              testID={`region-${v.place_code}`}
            />
          ))}
        </Card>
      ) : (
        <EmptyList icon="view-grid-outline" title={t('travels.empty.regions.title')} body={t('travels.empty.regions.body')} />
      )}
      {rest.length ? (
        <>
          <Text style={styles.section}>{t('travels.notVisited', { n: f.n(rest.length) }).toUpperCase()}</Text>
          <Card>
            {rest.map((r, i) => {
              const v = { place_type: 'region' as PlaceType, place_code: r.code };
              const label = name(v);
              const status = statusOf(visits, 'region', r.code);
              const trip = tripInto(trips, today, r.code);
              const days = trip ? Math.round((parseDay(trip.start_date).getTime() - parseDay(today).getTime()) / 86_400_000) : 0;
              return (
                <TravelRow
                  key={r.code}
                  name={label}
                  status={status}
                  sub={[status === 'want' ? t('travels.status.want') : null, trip ? t('travels.tripIn', { count: days, n: f.n(days) }) : null].filter(Boolean).join(' · ') || null}
                  right={
                    <>
                      {status === 'want' ? null : markButton({ ...v, country_iso2: country, name: label })}
                      {mapButton(v, label)}
                    </>
                  }
                  onPress={() => open(r.code)}
                  last={i === rest.length - 1}
                  testID={`region-${r.code}`}
                />
              );
            })}
          </Card>
        </>
      ) : null}
    </>
  );
}

function MapButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale pressEffect="opacity" haptic="selection" onPress={onPress} style={styles.mapButton} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <MaterialCommunityIcons name="map-marker-outline" size={22} color={colors.onAccentSoft} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  section: { ...t.type.footnote, fontWeight: '700', letterSpacing: 0.6, color: t.colors.textSecondary, marginTop: 6, marginHorizontal: 4 },
  mark: { minHeight: t.sizes.minTouch, paddingHorizontal: 12, justifyContent: 'center' },
  markText: { ...t.type.callout, fontSize: 14, fontWeight: '500', color: t.colors.link },
  mapButton: { width: 44, height: t.sizes.minTouch, alignItems: 'center', justifyContent: 'center' },
}));
