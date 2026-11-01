/**
 * Share a place in a chat (the share sheet's Place tile): the trip wizard's "Where to?"
 * search, so a destination, a division or district (it finds the destination there)
 * or an attraction ("Ratargul") can be picked. Its card goes into the chat.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useMe } from '../../../src/features/account/useMe';
import { attractionCard, destinationCard, sendCard } from '../../../src/features/chat/share';
import { useVisits } from '../../../src/features/map/visits';
import { localToday } from '../../../src/features/trips/dates';
import { DestinationSearch } from '../../../src/features/trips/new/DestinationSearch';
import { destinationsApi, placesApi } from '../../../src/services/api';
import { makeStyles } from '../../../src/ui/theme';

export default function SharePlaceScreen() {
  const styles = useStyles();
  const router = useRouter();
  const client = useQueryClient();
  const { chat } = useLocalSearchParams<{ chat: string }>();
  const me = useMe().data;
  const destinations = useQuery({ queryKey: ['destinations'], queryFn: destinationsApi.list });
  const places = useQuery({ queryKey: ['places', 'all'], queryFn: () => placesApi.list(), staleTime: 10 * 60_000 });
  const { data: visits = [] } = useVisits(me?.id);

  return (
    <View style={styles.screen}>
      <DestinationSearch
        destinations={destinations.data ?? []}
        places={places.data ?? []}
        visits={visits}
        selected=""
        today={localToday()}
        onClose={() => router.back()}
        onPick={(destination, placeId) => {
          if (!me) return;
          const place = placeId != null ? places.data?.find((p) => p.id === placeId) : undefined;
          sendCard(client, me.id, Number(chat), place ? attractionCard(place, destinations.data) : destinationCard(destination));
          router.back();
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
}));
