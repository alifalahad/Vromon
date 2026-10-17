/**
 * Supabase client: used for sign-in only (decision D1). All app data goes through
 * the FastAPI backend, which verifies the Supabase access token.
 *
 * PKCE flow: email verification, password reset and Google sign-in return to the
 * app through `vromon://auth/callback?code=…`, exchanged in app/auth/callback.tsx.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';

import { secureSessionStorage } from './secureSessionStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/** Null when the build has no Supabase settings (sign-in screens explain that). */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: Platform.OS === 'web' ? undefined : secureSessionStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null;

/** Where Supabase sends the user back after email links and OAuth. */
export const authRedirectUrl = (path: 'auth/callback' | 'auth/reset-password' = 'auth/callback') => Linking.createURL(path);

// Refresh tokens only while the app is in the foreground (Supabase's React Native advice).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
