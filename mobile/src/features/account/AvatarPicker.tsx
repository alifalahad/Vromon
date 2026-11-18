/**
 * The profile photo on Edit profile (UI refresh step 13, frame 27): your photo (or initials) with a camera
 * badge, and "Add photo" / "Change photo", which offers your photos, the camera, or "Remove". The photo is
 * cropped square on the phone; the server makes it 512 px without metadata and stores it on ImgBB, and
 * everyone who sees your profile sees it (the sheet says so).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { meApi } from '../../services/api';
import type { Me } from '../../types';
import { ActionSheet } from '../../ui/ActionSheet';
import { Avatar } from '../../ui/Avatar';
import { haptics } from '../../ui/haptics';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { notify } from '../../utils/dialogs';
import { ME_QUERY_KEY } from './useMe';

const EDGE = 1024;
const PHOTO = 104;
const RING = 4;

async function squareJpeg(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > EDGE) context.resize(asset.width >= asset.height ? { width: EDGE } : { height: EDGE });
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
    return saved.uri;
  } finally {
    image.release();
    context.release();
  }
}

export function AvatarPicker({ me }: { me: Me }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);

  const upload = async (pick: () => Promise<ImagePicker.ImagePickerResult>) => {
    const result = await pick();
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      const updated = await meApi.uploadAvatar(await squareJpeg(result.assets[0]));
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      haptics.success();
    } catch {
      haptics.error();
      notify(t('profile.photoFailedTitle'), t('profile.photoFailedBody'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const fromGallery = () =>
    upload(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 }));
  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return notify(t('profile.photoFailedTitle'), t('profile.cameraDenied'));
    return upload(() => ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 1, cameraType: ImagePicker.CameraType.front }));
  };
  const remove = async () => {
    setBusy(true);
    try {
      queryClient.setQueryData(ME_QUERY_KEY, await meApi.removeAvatar());
    } catch {
      notify(t('profile.photoFailedTitle'), t('profile.photoFailedBody'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const hasPhoto = !!me.avatar_url;
  const label = hasPhoto ? t('profile.changePhoto') : t('profile.addPhoto');
  return (
    <View style={styles.wrap}>
      <PressableScale
        pressEffect="opacity"
        onPress={() => setChoosing(true)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID="avatar-photo"
      >
        <View style={styles.ring}>
          <Avatar name={me.display_name ?? me.username} id={me.id} uri={me.avatar_url} size={PHOTO} />
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={colors.onAccent} />
            </View>
          ) : null}
        </View>
        {/* The camera badge says the photo can be changed; the button below says it in words */}
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons name="camera-outline" size={20} color={colors.onAccent} />
        </View>
      </PressableScale>
      <PressableScale pressEffect="opacity" onPress={() => setChoosing(true)} disabled={busy} style={styles.change} accessibilityRole="button" testID="avatar-change">
        <Text style={styles.changeText}>{label}</Text>
      </PressableScale>
      <ActionSheet
        visible={choosing}
        title={label}
        actions={[
          { key: 'gallery', icon: 'image-outline', label: t('profile.fromGallery'), onPress: fromGallery },
          { key: 'camera', icon: 'camera-outline', label: t('profile.takePhoto'), onPress: fromCamera },
          ...(hasPhoto ? [{ key: 'remove', icon: 'delete-outline' as const, label: t('profile.removePhoto'), onPress: remove, danger: true }] : []),
        ]}
        footnote={t('profile.photoNote')}
        onClose={() => setChoosing(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { alignItems: 'center', gap: 4, paddingTop: 6 },
  // Frame 27: a white ring round the photo, and a soft shadow under it
  ring: { padding: RING, borderRadius: PHOTO / 2 + RING, backgroundColor: t.colors.surface, ...t.depth.raised },
  busy: { position: 'absolute', left: RING, top: RING, width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.scrim },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.accentStrong,
    borderWidth: 3,
    borderColor: t.colors.bg,
  },
  change: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  changeText: { fontSize: 15, fontWeight: '500', color: t.colors.link },
}));
