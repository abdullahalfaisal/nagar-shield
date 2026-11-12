import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Theme as ThemeName } from '@nagar-shield/shared';
import { DEFAULT_THEME } from '@nagar-shield/shared';
import { ThemeContext, ThemeControlsContext } from './ThemeContext';
import { buildTheme } from './tokens';

const STORAGE_KEY = 'nagar-shield.theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);

  // The prototype defaults to dark; the user's explicit choice always wins.
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (cancelled || !stored) return;
      if (stored === 'light' || stored === 'dark') setThemeName(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    void AsyncStorage.setItem(STORAGE_KEY, name);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeName((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      void AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const theme = useMemo(() => buildTheme(themeName), [themeName]);
  const controls = useMemo(() => ({ setTheme, toggleTheme }), [setTheme, toggleTheme]);

  return (
    <ThemeContext.Provider value={theme}>
      <ThemeControlsContext.Provider value={controls}>{children}</ThemeControlsContext.Provider>
    </ThemeContext.Provider>
  );
}
