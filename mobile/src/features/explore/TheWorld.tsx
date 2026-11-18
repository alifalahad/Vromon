/**
 * Explore's "The world" (docs/ui-refresh step 12, frame 24): the catalogue's counts and how many countries
 * you've been to (it opens Your travels), the continents with how many of their countries you've visited, the
 * countries with the most people and the largest cities, each with your mark when there is one.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';

import type { Visit } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { flagEmoji } from '../geo/countries';
import { countryLabelPoint } from '../map/geoData';
import { GlobeImage } from '../map/globe/Globe';
import { beenCountries } from '../map/travels';
import { useMapTheme } from '../mapThemes/useMapTheme';
import { localDigits } from '../trips/plan/usePlanFormat';
import { CONTINENT_KEYS, compactNumber, useCities, useContinents, useCountries, type CityCard, type CountryCard } from './api';
import { PlaceRow, RowCard, SectionHead, Sources } from './ExploreParts';
import { cityStatus, countriesBeenByContinent, countryStatus } from './marks';
import { LoadFailed } from './YourCountry';

const ROWS = 10;

export const continentName = (t: (k: string) => string, name: string | null | undefined) =>
  name ? t(`explore.continents.${CONTINENT_KEYS[name] ?? 'asia'}`) : '';

export function TheWorld({ visits, home }: { visits: readonly Visit[]; home: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const mapTheme = useMapTheme();
  const bigText = useWindowDimensions().fontScale > 1.25;
  const continents = useContinents();
  const countries = useCountries();
  const cities = useCities({ limit: ROWS });
  const n = (v: number) => localDigits(String(v), lang);

  const byContinent = useMemo(() => countriesBeenByContinent(visits, countries.data ?? []), [visits, countries.data]);
  const been = beenCountries(visits).length;
  const total = (continents.data ?? []).reduce((s, c) => s + c.countries, 0);
  const [lon, lat] = countryLabelPoint(home) ?? [90, 23];
  const [before, after] = t('explore.beenCountries', { n: '§' }).split('§');
  const countryName = (c: CountryCard) => (lang === 'bn' ? c.name_bn || c.name : c.name);
  const openCountry = (iso2: string) => router.push({ pathname: '/explore/country/[iso2]', params: { iso2 } });

  if (!continents.data && !countries.data) {
    return continents.error ? <LoadFailed onRetry={() => continents.refetch()} /> : <ActivityIndicator color={colors.link} style={styles.loading} />;
  }

  return (
    <>
      <PressableScale
        onPress={() => router.push('/map/dashboard')}
        style={styles.hero}
        accessibilityRole="button"
        accessibilityLabel={[
          t('explore.world'),
          total ? t('explore.worldFacts', { countries: n(total), continents: n(continents.data?.length ?? 0) }) : null,
          t('explore.beenCountries', { n: n(been) }),
        ]
          .filter(Boolean)
          .join(', ')}
        testID="explore-world"
      >
        <View style={styles.heroText}>
          <Text style={styles.heroTitle} maxFontSizeMultiplier={1.2}>
            {t('explore.world')}
          </Text>
          {total ? (
            <Text style={styles.heroFacts} maxFontSizeMultiplier={1.3}>
              {t('explore.worldFacts', { countries: n(total), continents: n(continents.data?.length ?? 0) })}
            </Text>
          ) : null}
          <View style={styles.heroBeen}>
            <Text style={styles.heroBeenText} maxFontSizeMultiplier={1.3} testID="explore-world-count">
              {before}
              <Text style={{ color: colors.highlight, fontWeight: '700' }}>{n(been)}</Text>
              {after}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onHero} />
          </View>
        </View>
        <GlobeImage visits={visits} theme={mapTheme} size={104} lon={lon} lat={lat} glow={colors.globeGlow} />
      </PressableScale>

      {continents.data?.length ? (
        <>
          <SectionHead title={t('explore.byContinent')} />
          <View style={styles.tiles}>
            {continents.data.map((c) => {
              const visited = byContinent.get(c.name) ?? 0;
              const name = continentName(t, c.name);
              const line = [t('explore.countriesCount', { count: c.countries, n: n(c.countries) }), visited ? t('explore.nVisited', { n: n(visited) }) : null]
                .filter(Boolean)
                .join(' · ');
              return (
                <PressableScale
                  key={c.name}
                  pressEffect="opacity"
                  haptic="selection"
                  style={[styles.tile, visited ? { borderColor: mapTheme.status.visited } : null]}
                  onPress={() => router.push({ pathname: '/explore/continent/[name]', params: { name: c.name } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${line}`}
                  testID={`continent-${CONTINENT_KEYS[c.name]}`}
                >
                  {/* The name and the largest countries' flags on one row, the count under them: a 360 dp phone has room for both */}
                  <View style={styles.tileTop}>
                    <Text style={styles.tileName} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                      {name}
                    </Text>
                    {/* Decoration: kept at its size, and left out when large text needs the room for the name */}
                    {bigText ? null : (
                      <Text style={styles.tileFlags} accessible={false} maxFontSizeMultiplier={1}>
                        {c.largest
                          .slice(0, name.length > 8 ? 2 : 3)
                          .map((x) => flagEmoji(x.iso2))
                          .join('')}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.tileLine, visited ? styles.tileVisited : null]} maxFontSizeMultiplier={1.3}>
                    {line}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </>
      ) : null}

      {countries.data?.length ? (
        <>
          <SectionHead
            title={t('explore.mostPeople')}
            link={t('explore.allCountries')}
            onLink={() => router.push({ pathname: '/explore/continent/[name]', params: { name: 'world' } })}
            testID="explore-all-countries"
          />
          <RowCard>
            {countries.data.slice(0, ROWS).map((c, i) => (
              <CountryRow
                key={c.iso2}
                c={c}
                name={countryName(c)}
                status={countryStatus(visits, c.iso2)}
                onPress={() => openCountry(c.iso2)}
                last={i === ROWS - 1}
              />
            ))}
          </RowCard>
        </>
      ) : null}

      {cities.data?.length ? (
        <>
          <SectionHead
            title={t('explore.largestCities')}
            link={t('explore.allCities')}
            onLink={() => router.push({ pathname: '/explore/continent/[name]', params: { name: 'world', tab: 'cities' } })}
          />
          <RowCard>
            {cities.data.map((c, i) => (
              <CityRow
                key={c.geonameid}
                c={c}
                status={cityStatus(visits, c.geonameid)}
                onPress={() => openCountry(c.country_iso2)}
                last={i === cities.data.length - 1}
              />
            ))}
          </RowCard>
        </>
      ) : null}

      <Sources lines={[t('explore.countrySources'), t('explore.citiesNote')]} />
    </>
  );
}

/** A country in a list: flag, name, "1.40B people · Asia", your mark. */
export function CountryRow({
  c,
  name,
  status,
  onPress,
  last,
}: {
  c: CountryCard;
  name: string;
  status: Visit['status'] | null;
  onPress: () => void;
  last?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const sub = [c.facts?.population ? t('explore.peopleCount', { n: compactNumber(c.facts.population, i18n.language) }) : null, continentName(t, c.continent)]
    .filter(Boolean)
    .join(' · ');
  return <PlaceRow flag={flagEmoji(c.iso2)} title={name} sub={sub} status={status} onPress={onPress} last={last} testID={`country-row-${c.iso2}`} />;
}

/** A city in a list: its country's flag, its name, "37.7M people · Japan", your mark. */
export function CityRow({ c, status, onPress, last }: { c: CityCard; status: Visit['status'] | null; onPress: () => void; last?: boolean }) {
  const { t, i18n } = useTranslation();
  const sub = [t('explore.peopleCount', { n: compactNumber(c.population, i18n.language) }), c.country_name].filter(Boolean).join(' · ');
  return (
    <PlaceRow flag={flagEmoji(c.country_iso2)} title={c.name} sub={sub} status={status} onPress={onPress} last={last} testID={`city-row-${c.geonameid}`} />
  );
}

const useStyles = makeStyles((t) => ({
  loading: { marginVertical: 32 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingLeft: 22,
    paddingRight: 14,
    borderRadius: t.radius.hero,
    backgroundColor: t.colors.hero,
    ...t.depth.raised,
  },
  heroText: { flex: 1, gap: 4 },
  heroTitle: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal', fontSize: 30, lineHeight: 36, color: t.colors.onHero },
  heroFacts: { fontSize: 13.5, color: t.colors.onHeroSecondary },
  heroBeen: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, minHeight: 24 },
  heroBeenText: { fontSize: 13.5, fontWeight: '500', color: t.colors.onHero },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  tile: {
    width: '48.6%',
    minHeight: 58,
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: t.colors.surface,
    ...t.depth.card,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileName: { flex: 1, fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
  tileLine: { fontSize: 12.5, color: t.colors.textSecondary },
  tileVisited: { color: t.colors.onMarkTint, fontWeight: '500' },
  tileFlags: { fontSize: 14, letterSpacing: 1 },
}));
