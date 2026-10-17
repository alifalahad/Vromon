/**
 * Mark a place with a status. For a region or city whose country isn't marked as
 * visited yet, offers once to mark the country too ("Don't ask again" remembers).
 */

import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { resolveLanguage } from '../../i18n';
import type { Visit, VisitInput, VisitStatus } from '../../types';
import { haptics } from '../../ui/haptics';
import { usePreferences } from '../preferences/store';
import { mapCountryName } from './mapCountries';
import { setVisitStatus, statusOf, type PlaceRef } from './visits';

export function useMarkPlace(userId: string, visits: readonly Visit[]) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return (place: PlaceRef, status: VisitStatus, extra: Pick<VisitInput, 'first_visited_on'> = {}) => {
    setVisitStatus(queryClient, userId, place, status, extra);
    haptics.success();

    const country = place.country_iso2;
    const counts = status === 'visited' || status === 'lived';
    if (place.place_type === 'country' || !country || !counts) return;
    const countryStatus = statusOf(visits, 'country', country);
    if (countryStatus === 'visited' || countryStatus === 'lived') return;
    if (!usePreferences.getState().askMarkCountry) return;

    const name = mapCountryName(country, resolveLanguage(usePreferences.getState().language));
    Alert.alert(t('map.alsoMarkTitle', { country: name }), t('map.alsoMarkBody', { country: name }), [
      { text: t('map.dontAskAgain'), onPress: () => usePreferences.getState().setAskMarkCountry(false) },
      { text: t('map.alsoMarkNo'), style: 'cancel' },
      {
        text: t('map.alsoMarkYes'),
        onPress: () => {
          setVisitStatus(queryClient, userId, { place_type: 'country', place_code: country, country_iso2: country }, 'visited');
          haptics.success();
        },
      },
    ]);
  };
}
