/**
 * The old itinerary screen's address. The plan now lives on the trip screen
 * (trip planner step 2), so old links open that instead.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function ItineraryRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/trip/[id]', params: { id } }} />;
}
