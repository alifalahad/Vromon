/**
 * Vromon Mobile — all 64 districts of Bangladesh, by division, as photo cards (two per row).
 * From GET /explore/bangladesh; a card's photo is the district's own, else one of its sights,
 * else Esri's satellite view of it.
 */

import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { districtLine, localName, useBangladesh } from '../../src/features/explore/api';
import { PhotoCard, PhotoCredits } from '../../src/features/explore/PhotoCard';
import { localDigits } from '../../src/features/trips/plan/usePlanFormat';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function DistrictsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const bd = useBangladesh();
  const [division, setDivision] = useState<string | null>(null);
  const divisions = (bd.data?.divisions ?? []).filter((d) => !division || d.slug === division);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('explore.districtsTitle') }} />
      {bd.isLoading ? <ActivityIndicator color={colors.link} style={styles.loading} /> : null}
      <ScrollView contentContainerStyle={styles.body} testID="districts-screen">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[null, ...(bd.data?.divisions ?? [])].map((d) => {
            const on = (d?.slug ?? null) === division;
            return (
              <PressableScale
                key={d?.slug ?? 'all'}
                haptic="selection"
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setDivision(d?.slug ?? null)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{d ? localName(d, lang) : t('explore.allDivisions')}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
        {divisions.map((div) => (
          <View key={div.slug}>
            <Text style={styles.division} accessibilityRole="header">
              {t('explore.divisionTitle', { name: localName(div, lang) })}
              <Text style={styles.count}>{`  ${localDigits(String(div.districts.length), lang)}`}</Text>
            </Text>
            <View style={styles.grid}>
              {div.districts.map((d) => (
                <PhotoCard
                  key={d.slug}
                  photo={d.photo}
                  title={localName(d, lang)}
                  subtitle={districtLine(d, t, lang)}
                  badge={d.counts.gi_foods + d.counts.gi_products ? `GI ${localDigits(String(d.counts.gi_foods + d.counts.gi_products), lang)}` : null}
                  width="48.5%"
                  height={210}
                  onPress={() => router.push({ pathname: '/explore/district/[slug]', params: { slug: d.slug } })}
                />
              ))}
            </View>
          </View>
        ))}
        <PhotoCredits photos={divisions.flatMap((d) => d.districts.map((x) => x.photo))} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  loading: { marginTop: 24 },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  chips: { gap: 8, paddingVertical: 12 },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.colors.surface },
  chipOn: { backgroundColor: t.colors.accent },
  chipText: { ...t.type.callout, fontWeight: '600', color: t.colors.textSecondary },
  chipTextOn: { color: t.colors.onAccent },
  division: { ...t.type.title, color: t.colors.textPrimary, marginTop: 16, marginBottom: 10 },
  count: { ...t.type.headline, color: t.colors.textTertiary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, justifyContent: 'space-between' },
}));
