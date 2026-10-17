/**
 * Scans a friend's QR code. Explains why before the system camera prompt
 * (prompt §9), and points to Android settings if the camera was refused for good.
 * A valid code fires a success haptic; anything else an error haptic and a hint.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';

import { Button } from '../../ui/Button';
import { haptics } from '../../ui/haptics';
import { makeStyles, useTheme } from '../../ui/theme';
import { parseFriendCode } from './friendCode';

const RESCAN_AFTER_MS = 2000;

export function QrScanner({ onCode }: { onCode: (code: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [invalid, setInvalid] = useState(false);
  const busy = useRef(false);

  if (!permission) return <View style={styles.box} />;

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={styles.explainer} testID="camera-explainer">
        <MaterialCommunityIcons name="qrcode-scan" size={56} color={colors.textSecondary} />
        <Text style={styles.title}>{t('friends.cameraTitle')}</Text>
        <Text style={styles.body}>{blocked ? t('friends.cameraDenied') : t('friends.cameraBody')}</Text>
        <Button
          label={blocked ? t('friends.openSettings') : t('friends.cameraAllow')}
          onPress={() => (blocked ? Linking.openSettings() : requestPermission())}
          style={styles.button}
          testID="camera-allow"
        />
      </View>
    );
  }

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (busy.current) return;
    busy.current = true;
    const code = parseFriendCode(data);
    if (code) {
      haptics.success();
      setInvalid(false);
      onCode(code);
    } else {
      haptics.error();
      setInvalid(true);
    }
    // Same QR still in view: don't fire again straight away
    setTimeout(() => (busy.current = false), RESCAN_AFTER_MS);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScanned} />
        <View style={styles.frame} pointerEvents="none" />
      </View>
      <Text style={[styles.body, invalid && styles.error]} accessibilityLiveRegion="polite">
        {invalid ? t('friends.invalidCode') : t('friends.scanHint')}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.spacing.lg, alignItems: 'center' },
  box: { width: '100%', aspectRatio: 1, borderRadius: t.radius.card, overflow: 'hidden', backgroundColor: t.colors.surface },
  camera: { flex: 1 },
  frame: { position: 'absolute', top: '18%', left: '18%', right: '18%', bottom: '18%', borderRadius: 24, borderWidth: 3, borderColor: '#FFFFFF' },
  explainer: { alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xxl, paddingHorizontal: t.spacing.lg },
  title: { ...t.type.title, color: t.colors.textPrimary, textAlign: 'center' },
  body: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center' },
  error: { color: t.colors.danger },
  button: { alignSelf: 'stretch', marginTop: t.spacing.md },
}));
