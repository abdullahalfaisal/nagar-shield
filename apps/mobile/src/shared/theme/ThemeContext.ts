import { createContext, useContext } from 'react';
import type { Theme } from './tokens';

export const ThemeContext = createContext<Theme | null>(null);

export interface ThemeControls {
  setTheme: (name: 'light' | 'dark') => void;
  toggleTheme: () => void;
}

export const ThemeControlsContext = createContext<ThemeControls | null>(null);

/**
 * Access the active theme. Throws when used outside `ThemeProvider` so a
 * missing provider fails loudly at the first render instead of silently
 * rendering unstyled.
 */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used inside a <ThemeProvider>');
  }
  return theme;
}

/** Access the theme controls (set / toggle). */
export function useThemeControls(): ThemeControls {
  const controls = useContext(ThemeControlsContext);
  if (!controls) {
    throw new Error('useThemeControls must be used inside a <ThemeProvider>');
  }
  return controls;
}
