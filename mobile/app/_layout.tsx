/**
 * Vromon Mobile — Root layout.
 *
 * Sets up:
 * - TanStack Query provider
 * - Expo Router Stack navigator
 * - Global fonts and theme
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0F172A' },
          headerTintColor: '#60A5FA',
          headerTitleStyle: { fontWeight: 'bold', color: '#F1F5F9' },
          contentStyle: { backgroundColor: '#0F172A' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="destination/[id]" options={{ title: 'Destination' }} />
        <Stack.Screen
          name="trip/new"
          options={{ title: 'Plan a Trip', presentation: 'modal' }}
        />
        <Stack.Screen
          name="trip/[id]"
          options={{ title: 'Trip Details' }}
        />
        <Stack.Screen
          name="itinerary/[id]"
          options={{ title: 'Itinerary' }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
