/**
 * Development variant only (com.vromon.app.dev): allow plain HTTP, so a *release*
 * build of the dev variant can still reach the backend on this Mac
 * (http://127.0.0.1 over `adb reverse`) for performance measurements.
 * Preview and production builds never include this plugin: they stay HTTPS-only.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withDevCleartext(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};
