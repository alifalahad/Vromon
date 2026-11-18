/**
 * Vromon Mobile — all of Bangladesh's districts by division, as Explore's district cards with your marks
 * (docs/ui-refresh step 12). With `?show=plan`: every place Vromon can plan, by division, with "Plan a trip"
 * ("Ready to plan", See all). From GET /explore/bangladesh; a card's photo is the district's own, else one of
 * its sights, else Esri's satellite view of it.
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { useMe } from '../../src/features/account/useMe';
import { localName, useBangladesh } from '../../src/features/explore/api';
import { DistrictGrid, PhotoCredits, PlanCard, SectionHead } from '../../src/features/explore/ExploreParts';
import { districtOrder, districtStatus, planOrder } from '../../src/features/explore/marks';
import { DivisionChips, LoadFailed, usePlanTrip } from '../../src/features/explore/YourCountry';
import { useVisits } from '../../src/features/map/visits';
import { localDigits } from '../../src/features/trips/plan/usePlanFormat';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function DistrictsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const planTrip = usePlanTrip();
  const { show } = useLocalSearchParams<{ show?: string }>();
  const planning = show === 'plan';
  const bd = useBangladesh();
  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const [division, setDivision] = useState<string | null>(null);
  const all = useMemo(() => new Map((bd.data?.divisions ?? []).flatMap((d) => d.districts).map((d) => [d.slug, d])), [bd.data]);
  const places = useMemo(() => planOrder(bd.data?.destinations ?? [], all, visits), [bd.data, all, visits]);
  const plannable = useMemo(() => new Set(places.map((p) => p.district_slug)), [places]);
  const divisions = (bd.data?.divisions ?? []).filter((d) => !division || d.slug === division);
  const open = (slug: string) => router.push({ pathname: '/explore/district/[slug]', params: { slug } });
  const n = (v: number) => localDigits(String(v), lang);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: planning ? t('explore.readyToPlan') : t('explore.districtsTitle') }} />
      {!bd.data ? (
        bd.error ? (
          <LoadFailed onRetry={() => bd.refetch()} />
        ) : (
          <ActivityIndicator color={colors.link} style={styles.loading} />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.body} testID={planning ? 'plan-screen' : 'districts-screen'}>
          <DivisionChips divisions={bd.data.divisions} shown={division} onPick={setDivision} all={t('explore.allDivisions')} />
          {divisions.map((div) => {
            const here = planning ? places.filter((p) => all.get(p.district_slug)?.division_slug === div.slug) : [];
            const count = planning ? here.length : div.districts.length;
            if (!count) return null;
            return (
              <View key={div.slug}>
                <SectionHead title={`${t('explore.divisionTitle', { name: localName(div, lang) })} · ${n(count)}`} />
                {planning ? (
                  <View style={styles.pairs}>
                    {here.map((p) => (
                      <PlanCard
                        key={p.id}
                        place={p}
                        district={all.get(p.district_slug)}
                        status={districtStatus(visits, p.district_slug)}
                        onOpen={() => open(p.district_slug)}
                        onPlan={() => planTrip(p.name)}
                        style={styles.half}
                      />
                    ))}
                  </View>
                ) : (
                  <DistrictGrid
                    districts={districtOrder(div.districts)}
                    statusOf={(slug) => districtStatus(visits, slug)}
                    plannable={(slug) => plannable.has(slug)}
                    onOpen={(d) => open(d.slug)}
                  />
                )}
              </View>
            );
          })}
          <PhotoCredits photos={divisions.flatMap((d) => d.districts.map((x) => x.photo))} />
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  loading: { marginTop: 24 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  pairs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  half: { width: '48.3%' },
}));
