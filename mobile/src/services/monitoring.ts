/**
 * Vromon Mobile — crash and error reporting (Sentry), off unless
 * EXPO_PUBLIC_SENTRY_DSN is set at build time. A DSN is a public client key,
 * not a secret. No personal data: no IP address, user, request bodies or
 * screenshots; performance tracing is off.
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const monitoringEnabled = !!DSN;

export function initMonitoring() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: String(Constants.expoConfig?.extra?.appVariant ?? 'development'),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
  });
}

/** Wraps the root component (error boundary, touch breadcrumbs); harmless when off. */
export const wrapRoot = (component: React.ComponentType<Record<string, unknown>>) => (DSN ? Sentry.wrap(component) : component);
