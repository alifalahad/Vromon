import React, { forwardRef, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { makeStyles, useTheme } from './theme';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string | null;
  /** Shown under the field in the success colour (e.g. "Available") */
  ok?: string | null;
  /** Shown before the text, inside the field ("@" before a username) */
  prefix?: string;
  /** Shown at the end, inside the field (a username's check: "Yours", "Taken") */
  trailing?: React.ReactNode;
};

/**
 * Labelled text input with an error, hint or success line (UI refresh step 13, frame 27): a white field with
 * a thin line round it; focused, a blue line and a soft blue ring outside it; with an error, a red line.
 */
export const TextField = forwardRef<TextInput, Props>(function TextField({ label, error, hint, ok, prefix, trailing, style, onFocus, onBlur, ...rest }, ref) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError]}>
        {prefix ? (
          <Text style={styles.prefix} accessible={false}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, style]}
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
        {trailing}
      </View>
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
  label: { fontSize: 13, fontWeight: '700', color: t.colors.textSecondary, paddingLeft: 4 },
  field: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.control,
    paddingLeft: 16,
    paddingRight: 12,
    borderWidth: 1.5,
    borderColor: t.colors.hairline,
  },
  // Frame 27: a 2 dp blue line and a 4 dp soft ring outside it
  fieldFocused: { borderWidth: 2, borderColor: t.colors.accent, paddingLeft: 15.5, paddingRight: 11.5, outlineWidth: 4, outlineColor: t.colors.accentTint, outlineStyle: 'solid' },
  fieldError: { borderColor: t.colors.danger },
  prefix: { fontSize: 16.5, color: t.colors.textTertiary },
  input: { flex: 1, minHeight: 52, color: t.colors.textPrimary, fontSize: 16.5, paddingVertical: 0, paddingHorizontal: 0 },
  error: { ...t.type.footnote, color: t.colors.danger, paddingLeft: 4 },
  ok: { ...t.type.footnote, color: t.colors.success, paddingLeft: 4 },
  hint: { ...t.type.footnote, color: t.colors.textSecondary, paddingLeft: 4 },
}));
