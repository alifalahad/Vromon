/**
 * Signed-out screens. The root layout only allows this group while signed out.
 */

import { Stack } from 'expo-router';
import React from 'react';

import { useTheme } from '../../src/ui/theme';

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTitle: '',
        headerTransparent: true,
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
    </Stack>
  );
}
