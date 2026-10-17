import type { TFunction } from 'i18next';
import { Share } from 'react-native';

import { inviteLink } from './friendCode';

/** The system share sheet with an invite: the code and the link that opens the app. */
export async function shareInvite(code: string, t: TFunction) {
  try {
    await Share.share({ message: t('friends.shareMessage', { code, link: inviteLink(code) }) });
  } catch {
    // Dismissed or unavailable
  }
}
