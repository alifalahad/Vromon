/**
 * Sign-in actions. Each returns a user-facing error message, or null on success.
 */

import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';

import { unregisterForPush } from '../friends/push';
import { useUploadStore } from '../photos/uploads';
import { authRedirectUrl, supabase } from './supabase';

const NOT_CONFIGURED = 'Sign-in is not set up in this build.';

function message(error: { message: string } | null): string | null {
  return error ? error.message : null;
}

export async function signUpWithEmail(email: string, password: string): Promise<{ error: string | null; needsConfirmation: boolean }> {
  if (!supabase) return { error: NOT_CONFIGURED, needsConfirmation: false };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  // With "Confirm email" on, there is no session until the link is opened.
  return { error: message(error), needsConfirmation: !error && !data.session };
}

export async function signInWithEmail(email: string, password: string): Promise<string | null> {
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return message(error);
}

export async function resendConfirmation(email: string): Promise<string | null> {
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirectUrl() } });
  return message(error);
}

export async function sendPasswordReset(email: string): Promise<string | null> {
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl('auth/reset-password') });
  return message(error);
}

export async function setNewPassword(password: string): Promise<string | null> {
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.updateUser({ password });
  return message(error);
}

/** Exchange the `code` from an email link or OAuth redirect for a session. */
export async function exchangeCode(code: string): Promise<string | null> {
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return message(error);
}

/**
 * Google sign-in through the browser (Supabase OAuth, PKCE). Needs the Google
 * provider enabled in Supabase; no Google SDK or Android key hash in the app.
 * Returns null on success or when the user closes the browser.
 */
export async function signInWithGoogle(): Promise<string | null> {
  if (!supabase) return NOT_CONFIGURED;
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return message(error) ?? 'Google sign-in is not available.';
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null; // cancelled
  const params = new URL(result.url).searchParams;
  const code = params.get('code');
  if (!code) return params.get('error_description') ?? 'Google sign-in failed.';
  return exchangeCode(code);
}

export async function signOut(): Promise<void> {
  // While still signed in: stop this phone getting the account's notifications
  await unregisterForPush();
  await supabase?.auth.signOut();
  // Photos (yours and friends') are cached by id; the next person on this phone mustn't see them
  useUploadStore.setState({ pending: [] });
  await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]).catch(() => undefined);
}
