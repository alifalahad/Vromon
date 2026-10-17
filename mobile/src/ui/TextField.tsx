import React, { forwardRef, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { makeStyles, useTheme } from './theme';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string | null;
  /** Shown under the field in the success colour (e.g. "Available") */
  ok?: string | null;
};

/** Labelled text input with error / hint / success line. */
export const TextField = forwardRef<TextInput, Props>(function TextField({ label, error, hint, ok, style, onFocus, onBlur, ...rest }, ref) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, focused && styles.inputFocused, !!error && styles.inputError, style]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : ok ? (
        <Text style={styles.ok} accessibilityLiveRegion="polite">
          {ok}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles((t) => ({
  wrap: { gap: 6 },
  label: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary },
  input: {
    minHeight: 52,
    backgroundColor: t.colors.surface,
    color: t.colors.textPrimary,
    borderRadius: t.radius.control,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputFocused: { borderColor: t.colors.accent },
  inputError: { borderColor: t.colors.danger },
  error: { ...t.type.footnote, color: t.colors.danger },
  ok: { ...t.type.footnote, color: t.colors.success },
  hint: { ...t.type.footnote, color: t.colors.textTertiary },
}));
