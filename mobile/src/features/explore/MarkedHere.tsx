/**
 * What you've marked in a country other than Bangladesh (Explore's "Your country", docs/ui-refresh step 12):
 * its regions and cities you've marked, with your mark, names in your language. From your own marks.
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { makeStyles } from '../../ui/theme';
import { useTravelKit } from '../map/TravelKit';
import { countryOf } from '../map/travels';
import { PlaceRow, RowCard } from './ExploreParts';

export function MarkedHere({ country }: { country: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const { visits, name } = useTravelKit();
  const marked = visits
    .filter((v) => v.place_type !== 'country' && countryOf(v) === country)
    .sort((a, b) => a.place_type.localeCompare(b.place_type) || name(a).localeCompare(name(b)));
  if (!marked.length) {
    return (
      <Text style={styles.none} testID="marked-here-none">
        {t('explore.nothingMarkedHere')}
      </Text>
    );
  }
  return (
    <RowCard>
      {marked.map((v, i) => (
        <PlaceRow
          key={`${v.place_type}-${v.place_code}`}
          icon={v.place_type === 'city' ? 'city-variant-outline' : 'map-outline'}
          title={name(v)}
          status={v.status}
          onPress={() => router.push({ pathname: '/map/country/[iso2]', params: { iso2: country } })}
          last={i === marked.length - 1}
          testID={`marked-${v.place_type}-${v.place_code}`}
        />
      ))}
    </RowCard>
  );
}

const useStyles = makeStyles((t) => ({
  none: { ...t.type.callout, color: t.colors.textSecondary, marginHorizontal: 4 },
}));
