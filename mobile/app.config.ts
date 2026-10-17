/**
 * Expo app config (replaces app.json).
 *
 * APP_VARIANT (set per EAS profile in eas.json; unset locally = development)
 * gives each variant its own Android package and name, so a development build,
 * a preview APK and the Play release can be installed side by side.
 *
 * Never edit android/ or ios/ by hand: they are generated from this file
 * (Continuous Native Generation).
 */

import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';

const VARIANT: Variant = (process.env.APP_VARIANT as Variant | undefined) ?? 'development';

// Push notifications (Phase 5) need an EAS project and a Firebase project for FCM.
// Until both exist the app runs without push; the Friends badge still updates.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;
const GOOGLE_SERVICES_FILE = process.env.GOOGLE_SERVICES_FILE; // path to google-services.json

// Crash reporting (Phase 8). The SDK starts only with EXPO_PUBLIC_SENTRY_DSN. Source maps are
// uploaded during release builds only when the Sentry org and project are named here, with
// SENTRY_AUTH_TOKEN in the build environment (never in the app).
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

const IDS: Record<Variant, { name: string; package: string }> = {
  development: { name: 'Vromon (Dev)', package: 'com.vromon.app.dev' },
  preview: { name: 'Vromon (Preview)', package: 'com.vromon.app.preview' },
  production: { name: 'Vromon', package: 'com.vromon.app' },
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IDS[VARIANT].name,
  slug: 'vromon',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'vromon',
  // Appearance = System / Light / Dark is an in-app setting; the native shell follows the system.
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: IDS[VARIANT].package,
  },
  android: {
    package: IDS[VARIANT].package,
    adaptiveIcon: {
      backgroundColor: '#262626',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Photos come from the Android photo picker, which needs no storage access.
    // The image-picker module would otherwise request these.
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.RECORD_AUDIO',
      // MapLibre declares location for its user-location layer, which Vromon doesn't use:
      // the app never reads the device's location (privacy policy, Play Data safety).
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      // Pulled in by libraries; no biometric unlock and no drawing over other apps
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  plugins: [
    // Local work only: plain HTTP to the Mac's backend, also in release builds of the dev variant
    ...(VARIANT === 'development' ? ['./plugins/withDevCleartext'] : []),
    'expo-router',
    'expo-status-bar',
    'expo-localization',
    'expo-secure-store',
    'expo-web-browser',
    '@maplibre/maplibre-react-native',
    // Scanning friend QR codes only: no microphone
    ['expo-camera', { cameraPermission: 'Vromon uses the camera to scan friend QR codes.', recordAudioAndroid: false }],
    ['expo-notifications', { defaultChannel: 'friends', color: '#3379F3' }],
    ...(SENTRY_ORG && SENTRY_PROJECT
      ? [['@sentry/react-native/expo', { url: 'https://sentry.io/', organization: SENTRY_ORG, project: SENTRY_PROJECT }] as [string, object]]
      : []),
    // Photos from the library only. CAMERA stays (QR scanning); the same text as expo-camera.
    [
      'expo-image-picker',
      {
        photosPermission: 'Vromon lets you choose photos of the places you visit.',
        cameraPermission: 'Vromon uses the camera to scan friend QR codes.',
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#F5F5F5',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#262626' },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appVariant: VARIANT,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
