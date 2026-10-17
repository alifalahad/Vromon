/**
 * Full-screen photo viewer: swipe between photos, the place and date underneath,
 * and Delete for your own photos. The thumbnail shows while the full photo loads.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, StatusBar, Text, useWindowDimensions, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { photosApi } from '../../services/api';
import type { Photo } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles } from '../../ui/theme';
import { confirm, notify } from '../../utils/dialogs';
import { flagEmoji } from '../geo/countries';
import { fullSource, refreshPhotos, thumbSource } from './queries';

interface ViewerProps {
  photos: readonly Photo[];
  /** The photo to open at; null keeps the viewer closed */
  index: number | null;
  ownerId: string;
  canDelete: boolean;
  onClose: () => void;
}

export function PhotoViewer(props: ViewerProps) {
  return (
    <Modal visible={props.index !== null} animationType="fade" onRequestClose={props.onClose} statusBarTranslucent navigationBarTranslucent>
      <StatusBar barStyle="light-content" />
      {props.index !== null ? <ViewerBody {...props} start={props.index} /> : null}
    </Modal>
  );
}

function ViewerBody({ photos, start, ownerId, canDelete, onClose }: ViewerProps & { start: number }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const client = useQueryClient();
  const [visible, setVisible] = useState(start);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef<FlatList<Photo>>(null);
  // After a delete the list is shorter: stay in range
  const current = Math.min(visible, Math.max(photos.length - 1, 0));

  // FlatList needs the same function for its whole life
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<Photo>[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setVisible(first.index);
  }, []);

  const photo = photos[current];
  const date = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const remove = useCallback(() => {
    if (!photo) return;
    confirm(
      t('photos.deleteTitle'),
      t('photos.deleteBody'),
      t('photos.delete'),
      async () => {
        setDeleting(true);
        try {
          await photosApi.remove(photo.id);
          if (photos.length === 1) onClose(); // that was the last one
          // The list is about to lose its last page: step back first, or it shows nothing
          else if (current === photos.length - 1) listRef.current?.scrollToIndex({ index: current - 1, animated: false });
          await refreshPhotos(client, ownerId);
        } catch (err) {
          notify(t('photos.deleteFailed'), err instanceof Error ? err.message : t('common.error'), 'error');
        } finally {
          setDeleting(false);
        }
      },
      true,
    );
  }, [client, current, onClose, ownerId, photo, photos.length, t]);

  return (
    <View style={styles.container} testID="photo-viewer">
      <FlatList
        ref={listRef}
        data={photos}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={current}
        getItemLayout={(_, i) => ({
          length: width,
          offset: width * i,
          index: i,
        })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <Image
            source={fullSource(item)}
            placeholder={thumbSource(item)}
            placeholderContentFit="contain"
            contentFit="contain"
            transition={150}
            style={{ width, height }}
            accessibilityLabel={item.place_name ? t('photos.photoOf', { place: item.place_name }) : t('photos.photo')}
          />
        )}
      />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <PressableScale style={styles.round} onPress={onClose} accessibilityLabel={t('common.close')} testID="photo-viewer-close">
          <MaterialCommunityIcons name="close" size={26} color="#FFFFFF" />
        </PressableScale>
        <Text style={styles.counter}>{photos.length > 1 ? t('photos.counter', { index: current + 1, count: photos.length }) : ''}</Text>
        {canDelete ? (
          <PressableScale
            style={styles.round}
            haptic="light"
            onPress={remove}
            disabled={deleting}
            accessibilityLabel={t('photos.delete')}
            testID="photo-delete"
          >
            <MaterialCommunityIcons name="trash-can-outline" size={24} color="#FFFFFF" />
          </PressableScale>
        ) : (
          <View style={styles.round} />
        )}
      </View>

      {photo && (photo.place_name || photo.taken_on) ? (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          {photo.place_name ? (
            <Text style={styles.place} numberOfLines={1}>
              {photo.country_iso2 ? `${flagEmoji(photo.country_iso2)}  ` : ''}
              {photo.place_name}
            </Text>
          ) : null}
          {photo.taken_on ? <Text style={styles.date}>{date(photo.taken_on)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

// Always dark, whatever the appearance: photos read best on black
const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: '#000000' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.md,
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { ...t.type.callout, fontWeight: '600', color: '#FFFFFF' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: t.spacing.xl,
    paddingTop: t.spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: 2,
  },
  place: { ...t.type.headline, color: '#FFFFFF' },
  date: { ...t.type.footnote, color: '#D9D9D9' },
}));
