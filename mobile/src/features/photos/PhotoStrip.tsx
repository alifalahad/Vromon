/**
 * Photos of a place or a trip: a row of thumbnails, uploads in progress, and an
 * Add tile when they're your own. `PhotoGrid` is the same data as a grid (friend
 * profile). Tapping a photo opens the viewer.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Text, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import type { Photo, PhotoFilter, PhotoTarget } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { PhotoViewer } from './PhotoViewer';
import { thumbSource, usePhotos } from './queries';
import { useAddPhotos, usePendingPhotos, useRetryPhoto, type PendingPhoto } from './uploads';

const TILE = 96;

export function PhotoStrip({
  ownerId,
  filter,
  target,
  canEdit,
  title,
}: {
  ownerId: string | undefined;
  filter: PhotoFilter;
  /** Where new photos go (your own places and trips) */
  target: PhotoTarget | null;
  canEdit: boolean;
  title?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const photos = usePhotos(ownerId, filter);
  const pending = usePendingPhotos(canEdit ? target : null);
  const add = useAddPhotos(ownerId, canEdit ? target : null);
  const [open, setOpen] = useState<number | null>(null);
  const list = photos.data ?? [];

  return (
    <View style={styles.section} testID="photo-strip">
      <Text style={styles.title} accessibilityRole="header">
        {title ?? t('photos.title')}
        {list.length ? `  ·  ${list.length}` : ''}
      </Text>
      {!canEdit && !list.length ? (
        <Text style={styles.empty}>{photos.isPending ? '' : photos.isError ? t('photos.loadFailed') : t('photos.none')}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {canEdit ? (
            <PressableScale
              style={[styles.tile, styles.add]}
              haptic="medium"
              onPress={add}
              accessibilityLabel={t('photos.add')}
              testID="photo-add"
            >
              <MaterialCommunityIcons name="image-plus" size={30} color={styles.addText.color} />
              <Text style={styles.addText}>{t('photos.addShort')}</Text>
            </PressableScale>
          ) : null}
          {pending.map((p) => (
            <PendingTile key={p.key} item={p} ownerId={ownerId} />
          ))}
          {list.map((p, i) => (
            <Thumb key={p.id} photo={p} size={TILE} onPress={() => setOpen(i)} />
          ))}
        </ScrollView>
      )}
      {canEdit && !list.length && !pending.length ? <Text style={styles.hint}>{t('photos.privacyHint')}</Text> : null}
      <PhotoViewer photos={list} index={open} ownerId={ownerId ?? ''} canDelete={canEdit} onClose={() => setOpen(null)} />
    </View>
  );
}

export function PhotoGrid({ ownerId, filter, columns = 3, max = 60 }: { ownerId: string; filter: PhotoFilter; columns?: number; max?: number }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const photos = usePhotos(ownerId, filter);
  const [open, setOpen] = useState<number | null>(null);
  const list = (photos.data ?? []).slice(0, max);
  const gap = 4;
  const size = Math.floor((width - 2 * 22 - gap * (columns - 1)) / columns);

  return (
    <View style={styles.section} testID="photo-grid">
      <Text style={styles.title} accessibilityRole="header">
        {t('photos.title')}
        {photos.data?.length ? `  ·  ${photos.data.length}` : ''}
      </Text>
      {list.length ? (
        <View style={[styles.grid, { gap }]}>
          {list.map((p, i) => (
            <Thumb key={p.id} photo={p} size={size} onPress={() => setOpen(i)} />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>{photos.isPending ? '' : photos.isError ? t('photos.loadFailed') : t('photos.none')}</Text>
      )}
      <PhotoViewer photos={list} index={open} ownerId={ownerId} canDelete={false} onClose={() => setOpen(null)} />
    </View>
  );
}

function Thumb({ photo, size, onPress }: { photo: Photo; size: number; onPress: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <PressableScale
      style={[styles.tile, { width: size, height: size }]}
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={photo.place_name ? t('photos.photoOf', { place: photo.place_name }) : t('photos.photo')}
      testID={`photo-${photo.id}`}
    >
      <Image source={thumbSource(photo)} recyclingKey={photo.id} contentFit="cover" transition={120} style={styles.image} />
    </PressableScale>
  );
}

function PendingTile({ item, ownerId }: { item: PendingPhoto; ownerId: string | undefined }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { retry, discard } = useRetryPhoto(ownerId);
  const failed = item.status === 'failed';
  const onPress = () =>
    Alert.alert(t('photos.failedTitle'), item.error ?? t('common.error'), [
      { text: t('photos.discard'), style: 'destructive', onPress: () => discard(item.key) },
      { text: t('common.retry'), onPress: () => void retry(item.key) },
    ]);
  return (
    <PressableScale
      style={styles.tile}
      disabled={!failed}
      onPress={onPress}
      accessibilityLabel={failed ? t('photos.failedTitle') : t('photos.uploading', { percent: Math.round(item.progress * 100) })}
      testID={failed ? 'photo-failed' : 'photo-uploading'}
    >
      <Image source={{ uri: item.previewUri }} contentFit="cover" style={[styles.image, styles.pendingImage]} />
      <View style={styles.overlay}>
        {failed ? (
          <MaterialCommunityIcons name="alert-circle" size={30} color={colors.danger} />
        ) : (
          <>
            <ActivityIndicator color="#FFFFFF" />
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${Math.max(5, item.progress * 100)}%` }]} />
            </View>
          </>
        )}
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.spacing.sm },
  title: {
    ...t.type.footnote,
    fontWeight: '600',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: { gap: t.spacing.sm, paddingRight: t.spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: TILE, height: TILE, borderRadius: 14, overflow: 'hidden', backgroundColor: t.colors.surfaceInset },
  image: { width: '100%', height: '100%' },
  add: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.colors.border },
  addText: { ...t.type.caption, fontWeight: '600', color: t.colors.link },
  pendingImage: { opacity: 0.55 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  progressTrack: { width: '70%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  progressBar: { height: 4, backgroundColor: '#FFFFFF' },
  empty: { ...t.type.callout, color: t.colors.textSecondary },
  hint: { ...t.type.footnote, color: t.colors.textTertiary },
}));
