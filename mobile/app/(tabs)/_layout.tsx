/**
 * Vromon Mobile — Bottom tabs: Map · Trips · Friends · Settings (01-bottom-nav.jpg,
 * without Passport). Material icons, accent when active, selection haptic and a
 * small icon bounce on tab change. Friends shows a badge for incoming requests.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, type ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { useFriendRequests } from '../../src/features/friends/queries';
import { haptics } from '../../src/ui/haptics';
import { useTheme } from '../../src/ui/theme';
import { useReduceMotion } from '../../src/ui/useReduceMotion';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

function TabIcon({ name, color, focused, size }: { name: IconName; color: ColorValue; focused: boolean; size: number }) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (focused && !reduceMotion) {
      scale.value = withSequence(withSpring(1.15, { damping: 10, stiffness: 400 }), withSpring(1, { damping: 12, stiffness: 300 }));
    }
  }, [focused, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <MaterialIcons name={name} size={size} color={color} />
    </Animated.View>
  );
}

const TABS: { name: string; labelKey: string; icon: IconName }[] = [
  { name: 'index', labelKey: 'tabs.map', icon: 'map' },
  { name: 'trips', labelKey: 'tabs.trips', icon: 'luggage' },
  { name: 'friends', labelKey: 'tabs.friends', icon: 'people' },
  { name: 'settings', labelKey: 'tabs.settings', icon: 'settings' },
];

export default function TabLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: me } = useMe();
  const incoming = useFriendRequests('in', !!me).data?.length ?? 0;

  return (
    <Tabs
      screenListeners={{ tabPress: () => haptics.selection() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 0,
          elevation: 0,
          height: 76 + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom + 8,
        },
        tabBarLabelStyle: { ...theme.type.tabLabel, marginTop: 2 },
        // Four labels share the bar: they grow with the system font size up to 1.25×
        // (beyond that "Settings" would be cut off); the icons carry the meaning too
        tabBarLabel: ({ color, children }) => (
          <Text style={[theme.type.tabLabel, tabStyles.label, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>
            {children}
          </Text>
        ),
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.labelKey),
            // Without this, TalkBack also reads the icon font's glyph
            tabBarAccessibilityLabel:
              tab.name === 'friends' && incoming > 0 ? `${t(tab.labelKey)}, ${t('friends.requestsBadge', { count: incoming })}` : t(tab.labelKey),
            tabBarButtonTestID: `tab-${tab.name}`,
            ...(tab.name === 'friends' && incoming > 0
              ? { tabBarBadge: incoming, tabBarBadgeStyle: { backgroundColor: theme.colors.accent, color: theme.colors.onAccent } }
              : {}),
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={tab.icon} color={color} focused={focused} size={theme.sizes.tabIcon} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({ label: { marginTop: 2 } });
