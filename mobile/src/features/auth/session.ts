/**
 * Signed-in state, mirrored from Supabase Auth.
 *
 * `authEnabled` is false when the build has no Supabase settings; the app then
 * talks to the backend without a token (only works against a development backend
 * running with DEV_AUTH_BYPASS).
 */

import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from './supabase';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  /** True after a password-recovery link: the app must ask for a new password. */
  recovering: boolean;
};

export const authEnabled = supabase !== null;

export const useAuth = create<AuthState>(() => ({
  status: authEnabled ? 'loading' : 'signedIn',
  session: null,
  recovering: false,
}));

let started = false;

/** Load the stored session and follow Supabase auth events. Safe to call more than once. */
export function startAuthListener() {
  if (!supabase || started) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, status: data.session ? 'signedIn' : 'signedOut' });
  });
  supabase.auth.onAuthStateChange((event, session) => {
    useAuth.setState({
      session,
      status: session ? 'signedIn' : 'signedOut',
      recovering: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : useAuth.getState().recovering,
    });
  });
}

/** Current access token (refreshed by supabase-js when near expiry), or null. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
