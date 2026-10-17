/**
 * Resolves Appearance (System / Light / Dark) to a theme and provides it.
 *
 * Screens read tokens with `useTheme()`, or build cached StyleSheets with
 * `makeStyles((t) => ({ ... }))`.
 */

import React, { createContext, useContext, useEffect } from 'react';
import { Appearance, StyleSheet, useColorScheme } from 'react-native';

import { usePreferences } from '../../features/preferences/store';
import { darkTheme, lightTheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(darkTheme);

export function useResolvedTheme(): Theme {
  const appearance = usePreferences((s) => s.appearance);
  const system = useColorScheme();
  const scheme = appearance === 'system' ? (system === 'light' ? 'light' : 'dark') : appearance;
  return scheme === 'light' ? lightTheme : darkTheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useResolvedTheme();
  const appearance = usePreferences((s) => s.appearance);
  useEffect(() => {
    // Native UI (alert dialogs, switches, keyboard) follows a forced Light/Dark choice too.
    Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
  }, [appearance]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** One StyleSheet per theme, created on first use and cached. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T) {
  const cache = new Map<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
