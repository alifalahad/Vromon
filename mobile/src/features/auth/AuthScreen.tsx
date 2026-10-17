import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles } from '../../ui/theme';

/** Shared frame for sign-in screens: large title, subtitle, keyboard-safe scroll. */
export function AuthScreen({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function FormError({ message }: { message: string | null }) {
  const styles = useStyles();
  if (!message) return null;
  return (
    <Text style={styles.formError} accessibilityLiveRegion="assertive">
      {message}
    </Text>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingHorizontal: t.spacing.xxl, gap: t.spacing.lg },
  header: { gap: t.spacing.sm, marginBottom: t.spacing.md },
  title: { ...t.type.largeTitle, color: t.colors.textPrimary },
  subtitle: { ...t.type.body, color: t.colors.textSecondary, lineHeight: 22 },
  formError: { ...t.type.callout, color: t.colors.danger, backgroundColor: t.colors.dangerBg, padding: t.spacing.md, borderRadius: t.radius.control },
}));
