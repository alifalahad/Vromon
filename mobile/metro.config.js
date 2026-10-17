// Sentry's wrapper around Expo's default Metro config: adds debug IDs to bundles so
// crash reports map back to source. Behaves like the default config otherwise.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
