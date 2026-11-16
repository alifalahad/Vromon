/**
 * Your account picture, top right on every tab's front page (docs/ui-refresh step 10, D10; frames 1, 15, 18
 * and 19): the photo, or your initials, at 32 dp in a 48 dp touch area, the size of Google's. It opens
 * Settings. In a tab's header (TabHeader) it sits 12 dp under the status bar and 8 dp from the right edge;
 * over the map (`floating`) it's in the same spot, on a white circle so it shows on any map.
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useMe } from '../features/account/useMe';
import { Avatar } from './Avatar';
import { PressableScale } from './PressableScale';
import { makeStyles } from './theme';

/** The touch area and where it sits: the same on every tab, so it doesn't move when switching */
export const ACCOUNT = { area: 48, picture: 32, fromTop: 12, fromRight: 8 } as const;

export function AccountButton({ floating = false, onOpen, testID }: { floating?: boolean; onOpen?: () => void; testID: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe().data;
  const picture = <Avatar name={me?.display_name ?? me?.username} id={me?.id} uri={me?.avatar_url} size={ACCOUNT.picture} />;
  return (
    <PressableScale
      haptic="selection"
      style={styles.area}
      onPress={() => {
        onOpen?.();
        router.push('/settings');
      }}
      accessibilityRole="button"
      accessibilityLabel={t('common.account')}
      testID={testID}
    >
      {floating ? <View style={styles.circle}>{picture}</View> : picture}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  area: { width: ACCOUNT.area, height: ACCOUNT.area, alignItems: 'center', justifyContent: 'center' },
  // Frame 1: a white circle with a soft shadow round the picture, over the map
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surface,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
}));
