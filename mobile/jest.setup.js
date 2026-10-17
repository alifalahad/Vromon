/* Jest setup: mocks for native modules that have no JS implementation in tests. */

require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
require('react-native-reanimated').setUpTests();

jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  AndroidHaptics: {
    Confirm: 'confirm',
    Reject: 'reject',
    Context_Click: 'context-click',
    Long_Press: 'long-press',
    Segment_Tick: 'segment-tick',
    Virtual_Key: 'virtual-key',
  },
}));
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied', canAskAgain: false })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test]' })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: jest.fn(() => [{ granted: false, canAskAgain: true }, jest.fn()]),
}));
jest.mock('react-native-qrcode-svg', () => () => null);
// Photos: expo-image renders a plain View; the picker and manipulator are driven per test
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  const Image = (props) => jest.requireActual('react').createElement(View, { testID: props.testID, accessibilityLabel: props.accessibilityLabel });
  Image.clearDiskCache = jest.fn(() => Promise.resolve(true));
  Image.clearMemoryCache = jest.fn(() => Promise.resolve(true));
  return { Image };
});
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })) }));
jest.mock('expo-image-manipulator', () => {
  const image = { saveAsync: jest.fn(() => Promise.resolve({ uri: 'file:///cache/prepared.jpg', width: 10, height: 10 })), release: jest.fn() };
  const context = { resize: jest.fn(), renderAsync: jest.fn(() => Promise.resolve(image)), release: jest.fn() };
  context.resize.mockReturnValue(context);
  return { ImageManipulator: { manipulate: jest.fn(() => context) }, SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' } };
});
jest.mock('@sentry/react-native', () => ({ init: jest.fn(), wrap: (c) => c, captureException: jest.fn() }));
