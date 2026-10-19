/**
 * Vromon Mobile — Root layout.
 *
 * Sets up:
 * - Gesture handler root and bottom-sheet host
 * - Design tokens (Appearance = System / Light / Dark) and the matching navigation theme
 * - i18n
 * - TanStack Query provider
 * - The sign-in gate: signed out → (auth); signed in without a username → onboarding;
 *   otherwise the app. The splash screen stays up until that is known.
 */

import '../src/i18n';

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider, type Theme as NavigationTheme } from 'expo-router';
import * as Network from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useMe } from '../src/features/account/useMe';
import { signOut } from '../src/features/auth/actions';
import { startAuthListener, useAuth } from '../src/features/auth/session';
import { useFriendNotifications } from '../src/features/friends/useFriendNotifications';
import { useReminderTaps } from '../src/features/trips/today/useReminderTaps';
import { flushOutbox } from '../src/features/map/visits';
import { useSettingsSync } from '../src/features/preferences/sync';
import { initMonitoring, wrapRoot } from '../src/services/monitoring';
import { persistOptions, queryClient, queryPersister } from '../src/services/queryClient';
import { Button } from '../src/ui/Button';
import { makeStyles, ThemeProvider, useTheme, type Theme } from '../src/ui/theme';

SplashScreen.preventAutoHideAsync();
startAuthListener();


function navigationTheme(theme: Theme): NavigationTheme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.accent,
      background: theme.colors.bg,
      card: theme.colors.bg,
      text: theme.colors.textPrimary,
      border: theme.colors.divider,
      notification: theme.colors.danger,
    },
  };
}

/** Where the signed-in state leaves the user. */
function useGate() {
  const client = useQueryClient();
  const status = useAuth((s) => s.status);
  const recovering = useAuth((s) => s.recovering);
  const signedIn = status === 'signedIn';
  const me = useMe(signedIn);

  // Another account must never see cached data from the previous one (memory or disk)
  useEffect(() => {
    if (status === 'signedOut') {
      client.clear();
      void queryPersister.removeClient();
    }
  }, [status, client]);

  // Send offline map edits: now, when the app returns to the foreground, and when the network is back
  const userId = me.data?.id;
  useEffect(() => {
    if (!userId) return;
    const flush = () => void flushOutbox(userId, client);
    flush();
    const appState = AppState.addEventListener('change', (s) => s === 'active' && flush());
    const network = Network.addNetworkStateListener((n) => n.isConnected && flush());
    return () => {
      appState.remove();
      network.remove();
    };
  }, [userId, client]);

  useSettingsSync(signedIn && me.data ? me.data.id : null);
  useFriendNotifications(signedIn && me.data && !me.data.needs_onboarding ? me.data.id : null);
  useReminderTaps(!!(signedIn && me.data && !me.data.needs_onboarding));

  const ready = status !== 'loading' && (!signedIn || !me.isPending);
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  const loadFailed = signedIn && me.isError && !me.data;
  const onboarded = !!me.data && !me.data.needs_onboarding;
  return {
    // Exactly one group is open at a time. While the session or /me is still loading
    // (under the splash), the app stays open optimistically, so a link that opened
    // the app (e.g. /settings) survives; the router only redirects if it turns out
    // the user is signed out or still needs onboarding.
    inApp: !recovering && !loadFailed && (status === 'loading' || (signedIn && (me.isPending || onboarded))),
    showOnboarding: signedIn && !!me.data?.needs_onboarding,
    showAuth: status === 'signedOut' || loadFailed,
    loadFailed,
    retry: () => me.refetch(),
  };
}

function AccountLoadError({ onRetry }: { onRetry: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.overlay}>
      <Text style={styles.title}>{t('gate.loadFailed')}</Text>
      <Button label={t('gate.retry')} onPress={onRetry} style={styles.button} />
      <Button variant="secondary" label={t('common.signOut')} onPress={() => signOut()} style={styles.button} />
    </View>
  );
}

function ThemedStack() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navTheme = useMemo(() => navigationTheme(theme), [theme]);
  const gate = useGate();

  useEffect(() => {
    // Root view colour behind screens; avoids a white flash during transitions.
    SystemUI.setBackgroundColorAsync(theme.colors.bg).catch(() => {});
  }, [theme]);

  return (
    <NavigationThemeProvider value={navTheme}>
      <BottomSheetModalProvider>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.bg },
            headerTintColor: theme.colors.textPrimary,
            headerTitleStyle: { fontWeight: '700', color: theme.colors.textPrimary },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Protected guard={gate.inApp}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="destination/[id]" options={{ title: t('screens.destination') }} />
            <Stack.Screen name="trip/new" options={{ headerShown: false, title: t('screens.planTrip'), presentation: 'modal' }} />
            <Stack.Screen name="trip/must-dos/[id]" options={{ title: t('screens.mustDos') }} />
            <Stack.Screen name="trip/conditions/[id]" options={{ title: t('conditions.title') }} />
            <Stack.Screen name="trip/[id]" options={{ headerShown: false, title: t('screens.tripDetails') }} />
            <Stack.Screen name="trip/budget/[id]" options={{ title: t('screens.tripBudget') }} />
            <Stack.Screen name="trip/today/[id]" options={{ title: t('today.title') }} />
            <Stack.Screen name="itinerary/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="stats/trips" options={{ title: t('screens.tripStats') }} />
            <Stack.Screen name="trip/route/[id]" options={{ title: t('screens.tripRoute') }} />
            <Stack.Screen name="settings/profile" options={{ title: t('profile.edit') }} />
            <Stack.Screen name="settings/home-country" options={{ title: t('profile.homeCountry') }} />
            <Stack.Screen name="settings/delete-account" options={{ title: t('deleteAccount.title') }} />
            <Stack.Screen name="map/add-place" options={{ title: t('map.addPlace'), presentation: 'modal' }} />
            <Stack.Screen name="map/theme" options={{ title: t('mapTheme.title') }} />
            <Stack.Screen name="friends/add" options={{ title: t('friends.addFriend') }} />
            <Stack.Screen name="friends/[id]" options={{ title: '' }} />
            <Stack.Screen name="friends/compare/[id]" options={{ title: t('friends.compare') }} />
            <Stack.Screen name="add/[code]" options={{ title: t('friends.addFriend') }} />
            <Stack.Screen name="settings/blocked" options={{ title: t('friends.blockedUsers') }} />
          </Stack.Protected>
          <Stack.Protected guard={gate.showOnboarding}>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={gate.showAuth}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack.Protected>
          {/* Link targets: reachable whatever the state */}
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          <Stack.Screen name="auth/reset-password" options={{ title: '', headerTransparent: true }} />
        </Stack>
        {gate.loadFailed ? <AccountLoadError onRetry={gate.retry} /> : null}
      </BottomSheetModalProvider>
    </NavigationThemeProvider>
  );
}

// Crash reporting first, so start-up errors are caught too (no-op without a DSN)
initMonitoring();

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ThemeProvider>
          <ThemedStack />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

const useStyles = makeStyles((t) => ({
  overlay: {
    ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const),
    backgroundColor: t.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.lg,
    padding: t.spacing.xxl,
  },
  title: { ...t.type.title, color: t.colors.textPrimary, textAlign: 'center' },
  button: { alignSelf: 'stretch' },
}));

export default wrapRoot(RootLayout);
