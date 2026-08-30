import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** The three choices the user can pick in Settings. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** The resolved scheme actually used to render (never "system"). */
export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'theme:mode';

export type ThemeColors = (typeof Colors)[ColorScheme];

type ThemeContextValue = {
  /** What the user selected. */
  mode: ThemeMode;
  /** Change + persist the selection. */
  setMode: (mode: ThemeMode) => void;
  /** The scheme in effect right now (system choice resolved against the OS). */
  scheme: ColorScheme;
  /** Colors for the current scheme. */
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const hydrated = useRef(false);

  // Load the saved choice once on startup.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      } catch {
        // ignore – fall back to "system"
      } finally {
        hydrated.current = true;
      }
    })();
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // ignore – the in-memory value still updates the UI
    });
  };

  const scheme: ColorScheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, scheme, colors: Colors[scheme] }),
    [mode, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Full theme context – used by the Settings screen. */
export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within a ThemeProvider');
  return ctx;
}

/** Just the colors – used everywhere else via `useTheme()`. */
export function useColors(): ThemeColors {
  return useThemeContext().colors;
}
