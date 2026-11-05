/**
 * The profile photo on Edit profile: your photo (or initials), "Add photo" / "Change photo" from
 * the gallery or the camera, cropped square on the phone, and "Remove". The server makes it
 * 512 px without metadata and stores it on ImgBB; everyone who sees your profile sees it.
 */

import { useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { meApi } from '../../services/api';
import type { Me } from '../../types';
import { Avatar } from '../../ui/Avatar';
import { haptics } from '../../ui/haptics';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { notify } from '../../utils/dialogs';
import { ME_QUERY_KEY } from './useMe';

const EDGE = 1024;

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

  return (
    <View style={styles.wrap}>
      <View>
        <Avatar name={me.display_name ?? me.username} id={me.id} uri={me.avatar_url} size={112} />
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <PressableScale style={styles.button} onPress={fromGallery} disabled={busy} testID="avatar-gallery">
          <Text style={styles.buttonText}>{me.avatar_url ? t('profile.changePhoto') : t('profile.addPhoto')}</Text>
        </PressableScale>
        <PressableScale style={styles.button} onPress={fromCamera} disabled={busy} testID="avatar-camera">
          <Text style={styles.buttonText}>{t('profile.takePhoto')}</Text>
        </PressableScale>
        {me.avatar_url ? (
          <PressableScale style={styles.button} onPress={remove} disabled={busy} testID="avatar-remove">
            <Text style={[styles.buttonText, { color: colors.danger }]}>{t('profile.removePhoto')}</Text>
          </PressableScale>
        ) : null}
      </View>
      <Text style={styles.note}>{t('profile.photoNote')}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { alignItems: 'center', gap: 12, marginBottom: 20 },
  busy: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center', backgroundColor: t.colors.surfaceRaised },
  buttonText: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  note: { ...t.type.caption, color: t.colors.textTertiary, textAlign: 'center', paddingHorizontal: 24 },
}));
