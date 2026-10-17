import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { usePreferences } from '../features/preferences/store';
import { haptic, haptics } from '../ui/haptics';

const setOS = (os: typeof Platform.OS) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

describe('haptics wrapper', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    usePreferences.setState({ haptics: true });
  });
  afterAll(() => setOS(originalOS));

  it('uses Android system haptics on Android', () => {
    setOS('android');
    haptics.selection();
    haptics.medium();
    haptics.success();
    haptics.error();
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(1, Haptics.AndroidHaptics.Segment_Tick);
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(2, Haptics.AndroidHaptics.Context_Click);
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(3, Haptics.AndroidHaptics.Confirm);
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(4, Haptics.AndroidHaptics.Reject);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('uses selection / impact / notification feedback on iOS', () => {
    setOS('ios');
    haptics.selection();
    haptics.light();
    haptics.warning();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it('does nothing when the Haptic feedback setting is off', () => {
    setOS('android');
    usePreferences.setState({ haptics: false });
    haptic('success');
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it('swallows failures from unsupported hardware', async () => {
    setOS('android');
    (Haptics.performAndroidHapticsAsync as jest.Mock).mockRejectedValueOnce(new Error('no vibrator'));
    expect(() => haptic('light')).not.toThrow();
    await Promise.resolve();
  });
});
