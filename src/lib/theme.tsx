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
const MODAL_OPACITY_KEY = 'theme:modalOpacity';

/** How solid the glass modal cards are: 1 = most see-through, 5 = solid. */
export type ModalOpacityLevel = 1 | 2 | 3 | 4 | 5;
export const MODAL_OPACITY_LEVELS: ModalOpacityLevel[] = [1, 2, 3, 4, 5];
/** Level 2 matches the original glass look. */
const DEFAULT_MODAL_OPACITY: ModalOpacityLevel = 2;

/** Background alpha of the frosted fallback card (Android / older iOS). */
export const MODAL_FALLBACK_ALPHA: Record<ModalOpacityLevel, number> = {
  1: 0.5,
  2: 0.66,
  3: 0.8,
  4: 0.9,
  5: 1,
};
/** Alpha of the backing layer added under content on real liquid glass (iOS 26+). */
export const MODAL_LIQUID_ALPHA: Record<ModalOpacityLevel, number> = {
  1: 0,
  2: 0,
  3: 0.4,
  4: 0.7,
  5: 0.95,
};

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
  /** Opacity level of glass modal cards (1–5). */
  modalOpacity: ModalOpacityLevel;
  /** Change + persist the modal opacity level. */
  setModalOpacity: (level: ModalOpacityLevel) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [modalOpacity, setModalOpacityState] =
    useState<ModalOpacityLevel>(DEFAULT_MODAL_OPACITY);
  const hydrated = useRef(false);

  // Load the saved choices once on startup.
  useEffect(() => {
    (async () => {
      try {
        const [saved, savedOpacity] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(MODAL_OPACITY_KEY),
        ]);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
        const level = Number(savedOpacity);
        if (MODAL_OPACITY_LEVELS.includes(level as ModalOpacityLevel)) {
          setModalOpacityState(level as ModalOpacityLevel);
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

  const setModalOpacity = (level: ModalOpacityLevel) => {
    setModalOpacityState(level);
    AsyncStorage.setItem(MODAL_OPACITY_KEY, String(level)).catch(() => {
      // ignore – the in-memory value still updates the UI
    });
  };

  const scheme: ColorScheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode,
      scheme,
      colors: Colors[scheme],
      modalOpacity,
      setModalOpacity,
    }),
    [mode, scheme, modalOpacity],
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
