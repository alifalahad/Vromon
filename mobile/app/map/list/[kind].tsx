/**
 * A list behind a number on "Your travels" (docs/ui-refresh step 2, frames 4–5): countries,
 * divisions or regions, districts, cities, finished trips, the Want list, or one division's
 * districts and cities. Every list is built by the same function that gives the tile its number
 * (features/map/travels.ts). Each place can be shown on the map; a place not visited yet can be
 * marked from here. With nothing in it, a list says how to fill it.
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { flagEmoji } from '../../../src/features/geo/countries';
import { HOME_REGIONS } from '../../../src/features/map/geoData';
import { regionWord } from '../../../src/features/map/home';
import { mapCountryName } from '../../../src/features/map/mapCountries';
import { RegionList, useTravelKit } from '../../../src/features/map/TravelKit';
import { Card, EmptyList, StatusChip, TravelRow } from '../../../src/features/map/TravelParts';
import { placeName } from '../../../src/features/map/travelPlaces';
import { beenCities, beenCountries, beenDistricts, bundledDistricts, countryOf, finishedTrips, wantList } from '../../../src/features/map/travels';
import { statusOf } from '../../../src/features/map/visits';
import { durationDays, formatRange } from '../../../src/features/trips/dates';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import type { PlaceType, Visit, VisitStatus } from '../../../src/types';
import { makeStyles } from '../../../src/ui/theme';

export type ListKind = 'countries' | 'regions' | 'districts' | 'cities' | 'trips' | 'want' | 'region';

export default function TravelList() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kind, country, region } = useLocalSearchParams<{ kind: ListKind; country?: string; region?: string }>();
  const kit = useTravelKit();
  const { lang, visits, trips, lookup, today, name, year, mapButton, markButton } = kit;
  const regionTitle = (code: string) => placeName({ place_type: 'region', place_code: code }, lang, lookup) ?? code;

  let title = '';
  let body: React.ReactNode = null;

  switch (kind) {
    case 'countries': {
      title = t('travels.countries');
      const been = beenCountries(visits);
      const want = wantList(visits).filter((v) => v.place_type === 'country');
      body =
        been.length === 0 && want.length === 0 ? (
          <EmptyList icon="flag-variant-outline" title={t('travels.empty.countries.title')} body={t('travels.empty.countries.body')} action={t('travels.openMap')} onAction={() => router.dismissAll()} testID="travels-empty" />
        ) : (
          <>
            {been.length ? (
              <Card>
                {been.map((v, i) => (
                  <TravelRow
                    key={v.place_code}
                    name={`${flagEmoji(v.place_code)}  ${name(v)}`}
                    sub={[t(`travels.status.${v.status}`), year(v)].filter(Boolean).join(' · ')}
                    status={v.status}
                    right={mapButton(v, name(v))}
                    onPress={() => router.push({ pathname: '/map/country/[iso2]', params: { iso2: v.place_code } })}
                    last={i === been.length - 1}
                    testID={`country-${v.place_code}`}
                  />
                ))}
              </Card>
            ) : null}
            {want.length ? (
              <>
                <Text style={styles.section}>{`${t('travels.status.want')} · ${f.n(want.length)}`.toUpperCase()}</Text>
                <Card>
                  {want.map((v, i) => (
                    <TravelRow
                      key={v.place_code}
                      name={`${flagEmoji(v.place_code)}  ${name(v)}`}
                      status="want"
                      right={mapButton(v, name(v))}
                      onPress={() => router.push({ pathname: '/map/country/[iso2]', params: { iso2: v.place_code } })}
                      last={i === want.length - 1}
                    />
                  ))}
                </Card>
              </>
            ) : null}
          </>
        );
      break;
    }
    case 'regions': {
      const c = country ?? 'BD';
      title = t(`travels.${regionWord(c)}`);
      body = <RegionList country={c} kit={kit} />;
      break;
    }
    case 'region': {
      const code = region ?? '';
      title = regionTitle(code);
      const districts = bundledDistricts(code);
      const cities = beenCities(visits, { region: code, regionOf: (id) => lookup.cities.get(id)?.region ?? null });
      body = (
        <>
          {districts.length ? (
            <>
              <Text style={styles.section}>{t('travels.districts').toUpperCase()}</Text>
              <Card>
                {[...districts]
                  .sort((a, b) => rank(statusOf(visits, 'district', a.code)) - rank(statusOf(visits, 'district', b.code)) || a.name.localeCompare(b.name))
                  .map((d, i) => {
                    const status = statusOf(visits, 'district', d.code);
                    const label = lang === 'bn' ? d.name_bn : d.name;
                    const v = { place_type: 'district' as PlaceType, place_code: d.code };
                    return (
                      <TravelRow
                        key={d.code}
                        name={label}
                        status={status}
                        right={
                          <>
                            {status ? <StatusChip status={status} /> : markButton({ ...v, country_iso2: 'BD', name: label })}
                            {mapButton(v, label)}
                          </>
                        }
                        last={i === districts.length - 1}
                        testID={`district-${d.code}`}
                      />
                    );
                  })}
              </Card>
            </>
          ) : null}
          <Text style={styles.section}>{`${t('travels.cities')} · ${f.n(cities.length)}`.toUpperCase()}</Text>
          {cities.length ? (
            <Card>
              {cities.map((v, i) => (
                <TravelRow key={v.place_code} name={name(v)} sub={year(v)} status={v.status} right={mapButton(v, name(v))} last={i === cities.length - 1} />
              ))}
            </Card>
          ) : (
            <EmptyList icon="city-variant-outline" title={t('travels.empty.cities.title')} body={t('travels.empty.cities.body')} />
          )}
        </>
      );
      break;
    }
    case 'districts': {
      title = t('travels.districts');
      const list = beenDistricts(visits);
      const byDivision = HOME_REGIONS.features
        .map((r) => ({ code: r.properties.code, name: lang === 'bn' ? r.properties.name_bn : r.properties.name, items: list.filter((v) => bundledDistricts(r.properties.code).some((d) => d.code === v.place_code)) }))
        .filter((g) => g.items.length);
      body = list.length ? (
        byDivision.map((g) => (
          <View key={g.code} style={styles.group}>
            <Text style={styles.section}>{g.name.toUpperCase()}</Text>
            <Card>
              {g.items.map((v, i) => (
                <TravelRow key={v.place_code} name={name(v)} sub={year(v)} status={v.status} right={<><StatusChip status={v.status} />{mapButton(v, name(v))}</>} last={i === g.items.length - 1} />
              ))}
            </Card>
          </View>
        ))
      ) : (
        <EmptyList icon="hexagon-outline" title={t('travels.empty.districts.title')} body={t('travels.empty.districts.body')} action={t('travels.openMap')} onAction={() => router.dismissAll()} testID="travels-empty" />
      );
      break;
    }
    case 'cities': {
      title = t('travels.cities');
      const list = beenCities(visits);
      const countries = [...new Set(list.map(countryOf))].sort((a, b) => mapCountryName(a, lang).localeCompare(mapCountryName(b, lang)));
      body = list.length ? (
        countries.map((c) => {
          const items = list.filter((v) => countryOf(v) === c);
          return (
            <View key={c} style={styles.group}>
              <Text style={styles.section}>{`${flagEmoji(c)}  ${mapCountryName(c, lang)}`.toUpperCase()}</Text>
              <Card>
                {items.map((v, i) => (
                  <TravelRow key={v.place_code} name={name(v)} sub={year(v)} status={v.status} right={<><StatusChip status={v.status} />{mapButton(v, name(v))}</>} last={i === items.length - 1} />
                ))}
              </Card>
            </View>
          );
        })
      ) : (
        <EmptyList icon="city-variant-outline" title={t('travels.empty.cities.title')} body={t('travels.empty.cities.body')} action={t('travels.openMap')} onAction={() => router.dismissAll()} testID="travels-empty" />
      );
      break;
    }
    case 'trips': {
      title = t('travels.tripsTitle');
      const list = finishedTrips(trips, today);
      body = list.length ? (
        <Card>
          {list.map((trip, i) => {
            const n = durationDays(trip.start_date, trip.end_date);
            return (
              <TravelRow
                key={trip.id}
                name={trip.title || trip.destination}
                sub={t('travels.tripLine', { count: n, n: f.n(n), dates: f.time(formatRange(trip.start_date, trip.end_date, i18n.language)) })}
                onPress={() => router.push({ pathname: '/trip/[id]', params: { id: String(trip.id) } })}
                last={i === list.length - 1}
                testID={`travel-trip-${trip.id}`}
              />
            );
          })}
        </Card>
      ) : (
        <EmptyList icon="bag-suitcase-outline" title={t('travels.empty.trips.title')} body={t('travels.empty.trips.body')} action={t('travels.openTrips')} onAction={() => router.navigate('/(tabs)/trips')} testID="travels-empty" />
      );
      break;
    }
    case 'want': {
      title = t('travels.want');
      const list = wantList(visits);
      body = list.length ? (
        <Card>
          {list.map((v, i) => (
            <TravelRow
              key={`${v.place_type}-${v.place_code}`}
              name={v.place_type === 'country' ? `${flagEmoji(v.place_code)}  ${name(v)}` : name(v)}
              sub={typeLine(v, t, lang)}
              status="want"
              right={mapButton(v, name(v))}
              last={i === list.length - 1}
              testID={`want-${v.place_type}-${v.place_code}`}
            />
          ))}
        </Card>
      ) : (
        <EmptyList icon="bookmark-outline" title={t('travels.empty.want.title')} body={t('travels.empty.want.body')} action={t('travels.openMap')} onAction={() => router.dismissAll()} testID="travels-empty" />
      );
      break;
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} testID={`travels-list-${kind}`}>
        {body}
      </ScrollView>
      {kit.sheet}
    </View>
  );
}

const rank = (s: VisitStatus | null) => (s === 'lived' ? 0 : s === 'visited' ? 1 : s === 'want' ? 2 : 3);

function typeLine(v: Visit, t: (k: string, o?: Record<string, unknown>) => string, lang: 'en' | 'bn'): string {
  const word = v.place_type === 'region' ? t(`travels.type.${regionWord(countryOf(v)) === 'divisions' ? 'division' : 'region'}`) : t(`travels.type.${v.place_type}`);
  return v.place_type === 'country' ? word : `${word} · ${mapCountryName(countryOf(v), lang)}`;
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.spacing.lg, paddingTop: t.spacing.sm, gap: 12 },
  group: { gap: 8 },
  section: { ...t.type.footnote, fontWeight: '700', letterSpacing: 0.6, color: t.colors.textSecondary, marginTop: 6, marginHorizontal: 4 },
}));
