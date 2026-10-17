/**
 * Find a city (GeoNames, via /geo/cities) to use as a trip stop. Shows the most
 * populous matches with their country.
 */

import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View, type ScrollView } from 'react-native';

import { resolveLanguage } from '../../i18n';
import { geoApi } from '../../services/api';
import type { GeoCity } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { TextField } from '../../ui/TextField';
import { makeStyles, useTheme } from '../../ui/theme';
import { countryName, flagEmoji } from '../geo/countries';
import { usePreferences } from '../preferences/store';

const MAX_RESULTS = 6;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** The scroll view around the search, so it can bring itself above the keyboard. */
export interface RevealIn {
  scrollRef: RefObject<ScrollView | null>;
  innerRef: RefObject<View | null>;
}

export function CitySearch({
  label,
  onPick,
  reveal,
  testID,
}: {
  label: string;
  onPick: (city: GeoCity, country: string) => void;
  reveal?: RevealIn;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 300);
  const cities = useQuery({ queryKey: ['geo-cities', q], queryFn: () => geoApi.cities(q), enabled: q.length >= 2, staleTime: 60_000 });
  const wrapRef = useRef<View>(null);
  const [focused, setFocused] = useState(false);

  // The keyboard covers the lower half: scroll the field (and its results) to the top
  const scrollIntoView = useCallback(() => {
    const inner = reveal?.innerRef.current;
    if (!inner) return;
    setTimeout(() => {
      wrapRef.current?.measureLayout(inner, (_x, y) => reveal.scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }));
    }, 250);
  }, [reveal]);
  const resultCount = cities.data?.length ?? 0;
  useEffect(() => {
    if (focused) scrollIntoView();
  }, [focused, resultCount, scrollIntoView]);

  return (
    <View style={styles.wrap} ref={wrapRef}>
      <TextField
        label={label}
        value={query}
        onChangeText={setQuery}
        placeholder={t('trips.stopSearch')}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        testID={testID}
      />
      {cities.isFetching && !cities.data ? <ActivityIndicator color={colors.link} /> : null}
      {q.length >= 2
        ? (cities.data ?? []).slice(0, MAX_RESULTS).map((city) => {
            const country = countryName(city.country_iso2, lang) ?? city.country_iso2;
            return (
              <PressableScale
                key={city.geonameid}
                pressEffect="opacity"
                haptic="selection"
                style={styles.result}
                onPress={() => {
                  onPick(city, country);
                  setQuery('');
                }}
                accessibilityLabel={`${city.name}, ${country}`}
                testID={`city-${city.geonameid}`}
              >
                <Text style={styles.flag}>{flagEmoji(city.country_iso2)}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {city.name}
                  <Text style={styles.country}>{`, ${country}`}</Text>
                </Text>
              </PressableScale>
            );
          })
        : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.spacing.xs },
  result: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 48, paddingHorizontal: t.spacing.sm },
  flag: { fontSize: 22 },
  name: { ...t.type.body, color: t.colors.textPrimary, flex: 1 },
  country: { color: t.colors.textSecondary },
}));
