/**
 * The shareable poster (map home step 10): a picture of your map, your counts,
 * and the app's name, at 1080×1920 (a story's size). Shown as a preview first, then captured:
 * Save puts it in the gallery, Share hands it to the share sheet (Instagram or Facebook: Story). It never includes your location or your friends:
 * the map picture is taken with those layers off (see the map screen).
 */

import { MaterialIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Text, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '../../ui/haptics';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { notify } from '../../utils/dialogs';
import { saveToGallery, shareImage } from '../share/saveShare';

const W = 360;
const H = 640;

export function PosterPreview({
  mapUri,
  title,
  headline,
  detail,
  onClose,
}: {
  /** The map picture, or null while it's being taken */
  mapUri: string | null;
  title: string;
  headline: string;
  detail: string | null;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const poster = useRef<View>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const scale = Math.min(1, (width - 48) / W, (height - insets.top - insets.bottom - 150) / H);

  const capture = () => captureRef(poster, { format: 'png', width: 1080, height: 1920, result: 'tmpfile' });
  const share = async () => {
    if (!poster.current) return;
    setBusy('share');
    try {
      const uri = await capture();
      haptics.success();
      await shareImage(uri, title);
    } catch {
      notify(t('map.replay.posterFailed'), '', 'error');
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (!poster.current) return;
    setBusy('save');
    try {
      const result = await saveToGallery(await capture());
      if (result === 'saved') notify(t('share.savedTitle'), t('share.savedBody'), 'success');
      else notify(t('share.saveFailedTitle'), result === 'denied' ? t('share.deniedBody') : t('share.failedBody'), 'error');
    } catch {
      notify(t('map.replay.posterFailed'), '', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.overlay} testID="poster-preview">
      <View style={{ width: W * scale, height: H * scale }}>
        <View style={{ transform: [{ scale }], transformOrigin: 'top left' }}>
          <View ref={poster} collapsable={false} style={styles.poster} accessible accessibilityLabel={`${title}. ${headline}. ${detail ?? ''}`}>
            {mapUri ? (
              <Image source={{ uri: mapUri }} style={styles.map} resizeMode="cover" />
            ) : (
              <View style={[styles.map, styles.mapLoading]}>
                <ActivityIndicator color="#F4F4F5" />
              </View>
            )}
            <View style={styles.text}>
              <Text style={styles.eyebrow}>{title}</Text>
              <Text style={styles.headline}>{headline}</Text>
              {detail ? <Text style={styles.detail}>{detail}</Text> : null}
            </View>
            <Text style={styles.brand}>Vromon</Text>
          </View>
        </View>
      </View>
      <View style={[styles.buttons, { marginBottom: insets.bottom + 16 }]}>
        <PressableScale style={styles.secondary} onPress={onClose} accessibilityLabel={t('common.close')} testID="poster-close">
          <MaterialIcons name="close" size={22} color={colors.textPrimary} />
        </PressableScale>
        <PressableScale style={[styles.save, (!mapUri || !!busy) && styles.disabled]} disabled={!mapUri || !!busy} onPress={save} accessibilityLabel={t('share.save')} testID="poster-save">
          {busy === 'save' ? <ActivityIndicator color={colors.textPrimary} /> : <MaterialIcons name="download" size={22} color={colors.textPrimary} />}
          <Text style={styles.saveText}>{t('share.save')}</Text>
        </PressableScale>
        <PressableScale style={[styles.primary, (!mapUri || !!busy) && styles.disabled]} disabled={!mapUri || !!busy} onPress={share} testID="poster-share">
          {busy === 'share' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{t('map.replay.poster')}</Text>}
        </PressableScale>
      </View>
      <Text style={styles.hint}>{t('share.storyHint')}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 10, 13, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  // Always the dark poster, whatever the app's appearance
  poster: { width: W, height: H, backgroundColor: '#11151B', overflow: 'hidden', borderRadius: 24 },
  map: { width: W, height: H * 0.74 },
  mapLoading: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C2027' },
  text: { paddingHorizontal: 24, paddingTop: 14, gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: '#F5A06B' },
  headline: { fontSize: 30, lineHeight: 34, fontWeight: '800', color: '#F4F4F5' },
  detail: { fontSize: 15, color: '#B9BFC9' },
  brand: { position: 'absolute', left: 24, bottom: 20, fontSize: 14, fontWeight: '800', letterSpacing: 1, color: '#8AB4F8' },
  buttons: { flexDirection: 'row', gap: 12, width: '100%', paddingHorizontal: 24 },
  primary: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: t.colors.accentStrong, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...t.type.headline, fontSize: 16, color: t.colors.onAccent },
  secondary: { width: 52, height: 52, borderRadius: 26, backgroundColor: t.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  save: { minHeight: 52, paddingHorizontal: 18, borderRadius: 26, backgroundColor: t.colors.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveText: { ...t.type.headline, fontSize: 16, color: t.colors.textPrimary },
  hint: { ...t.type.caption, color: '#B9BFC9', marginTop: -8 },
  disabled: { opacity: 0.5 },
}));
