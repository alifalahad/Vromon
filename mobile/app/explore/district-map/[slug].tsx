/**
 * Vromon Mobile — a district's rendered map, full screen: pinch to zoom, English or Bangla, and
 * Save (to the gallery) or Share (Instagram, Facebook, …). The map is the data platform's render
 * (relief from Copernicus DEM, rivers from OpenStreetMap, reviewed attractions), its credits on it.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { districtMapUrl, mapLanguage, useDistrictMaps } from '../../../src/features/explore/api';
import { ZoomableImage } from '../../../src/features/explore/ZoomableImage';
import { localCopy, saveToGallery, shareImage } from '../../../src/features/share/saveShare';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles } from '../../../src/ui/theme';
import { notify } from '../../../src/utils/dialogs';

export default function DistrictMapScreen() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  const maps = useDistrictMaps(slug ?? '');
  const [chosen, setChosen] = useState<'en' | 'bn' | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const lang = chosen ?? mapLanguage(maps.data, i18n.language);

  const version = lang ? maps.data?.versions?.[lang] : undefined;
  const file = async () => localCopy(districtMapUrl(slug!, lang!, 'full', version), `${slug}-${lang}-${version ?? maps.data?.made_on ?? 'map'}.jpg`);
  const save = async () => {
    setBusy('save');
    try {
      const result = await saveToGallery(await file());
      notify(result === 'saved' ? t('share.savedTitle') : t('share.saveFailedTitle'), result === 'saved' ? t('share.savedBody') : result === 'denied' ? t('share.deniedBody') : t('share.failedBody'));
    } catch {
      notify(t('share.saveFailedTitle'), t('share.failedBody'));
    } finally {
      setBusy(null);
    }
  };
  const share = async () => {
    setBusy('share');
    try {
      await shareImage(await file(), t('share.shareMapTitle', { name: name ?? '' }));
    } catch {
      notify(t('share.saveFailedTitle'), t('share.failedBody'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      {lang ? (
        <ZoomableImage
          uri={districtMapUrl(slug!, lang, 'full', version)}
          placeholder={districtMapUrl(slug!, lang, 'card', version)}
          aspectRatio={(maps.data?.width ?? 4) / (maps.data?.height ?? 5)}
          accessibilityLabel={t('explore.mapOf', { name: name ?? '' })}
        />
      ) : maps.isLoading ? (
        <ActivityIndicator color="#FFFFFF" style={styles.loading} />
      ) : (
        <Text style={styles.empty}>{t('explore.noDistrictMap')}</Text>
      )}
      <View style={[styles.top, { top: insets.top + 8 }]}>
        <PressableScale style={styles.round} onPress={() => router.back()} accessibilityLabel={t('explore.back')} hitSlop={8}>
          <MaterialIcons name="close" size={24} color="#FFFFFF" />
        </PressableScale>
        {maps.data && maps.data.languages.length > 1 ? (
          <View style={styles.langs}>
            {maps.data.languages.map((l) => (
              <PressableScale
                key={l}
                haptic="selection"
                style={[styles.lang, lang === l && styles.langOn]}
                onPress={() => setChosen(l)}
                accessibilityRole="radio"
                accessibilityState={{ selected: lang === l }}
              >
                <Text style={[styles.langText, lang === l && styles.langTextOn]}>{l === 'bn' ? 'বাংলা' : 'English'}</Text>
              </PressableScale>
            ))}
          </View>
        ) : null}
      </View>
      {lang ? (
        <View style={[styles.actions, { bottom: insets.bottom + 16 }]}>
          <PressableScale style={styles.action} onPress={save} disabled={!!busy} testID="district-map-save">
            {busy === 'save' ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="download" size={22} color="#FFFFFF" />}
            <Text style={styles.actionText}>{t('share.save')}</Text>
          </PressableScale>
          <PressableScale style={[styles.action, styles.actionMain]} onPress={share} disabled={!!busy} testID="district-map-share">
            {busy === 'share' ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="share" size={22} color="#FFFFFF" />}
            <Text style={styles.actionText}>{t('share.share')}</Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: '#111111' },
  loading: { flex: 1 },
  empty: { ...t.type.callout, color: '#FFFFFF', textAlign: 'center', marginTop: 200, paddingHorizontal: 32 },
  top: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  langs: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 22, padding: 4, marginRight: 60 },
  lang: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  langOn: { backgroundColor: '#FFFFFF' },
  langText: { color: '#FFFFFF', fontWeight: '600' },
  langTextOn: { color: '#111111' },
  actions: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 12 },
  action: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  actionMain: { backgroundColor: t.colors.accent },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
}));
