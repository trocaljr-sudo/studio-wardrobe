import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

type ThemeColors = {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceMuted: string;
  surfaceStrong: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  accentMuted: string;
  accentText: string;
  danger: string;
  dangerMuted: string;
  success: string;
  input: string;
  placeholder: string;
  overlay: string;
};

type ThemeContextValue = {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  colors: ThemeColors;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  loaded: boolean;
};

const STORAGE_KEY = 'studio-wardrobe-theme-mode';

const palettes: Record<ResolvedTheme, ThemeColors> = {
  dark: {
    background: '#0A100F',
    backgroundAlt: '#111816',
    surface: '#121916',
    surfaceMuted: '#151D1A',
    surfaceStrong: '#18211D',
    border: '#24302A',
    text: '#F3F5F2',
    textMuted: '#A5AEA9',
    textSubtle: '#7D8782',
    accent: '#36B784',
    accentMuted: '#1F6B52',
    accentText: '#F5FFF9',
    danger: '#F07E7E',
    dangerMuted: '#442726',
    success: '#62D59B',
    input: '#151D1A',
    placeholder: '#7D8782',
    overlay: '#0F1513',
  },
  light: {
    background: '#F2F5F1',
    backgroundAlt: '#E8EEE8',
    surface: '#F8FBF7',
    surfaceMuted: '#FFFFFF',
    surfaceStrong: '#ECF4EE',
    border: '#D7E1D8',
    text: '#16201B',
    textMuted: '#5E6C64',
    textSubtle: '#839088',
    accent: '#2FAE79',
    accentMuted: '#D7F2E6',
    accentText: '#F4FFF9',
    danger: '#C05555',
    dangerMuted: '#F7DDDD',
    success: '#248C5F',
    input: '#FFFFFF',
    placeholder: '#839088',
    overlay: '#E6EDE7',
  },
};

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'system',
  resolvedTheme: 'light',
  colors: palettes.light,
  isDark: false,
  setThemeMode: async () => {},
  loaded: false,
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadThemeMode = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);

        if (!mounted) {
          return;
        }

        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemeModeState(stored);
        }
      } finally {
        if (mounted) {
          setLoaded(true);
        }
      }
    };

    loadThemeMode();

    return () => {
      mounted = false;
    };
  }, []);

  const resolvedTheme: ResolvedTheme =
    themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      resolvedTheme,
      colors: palettes[resolvedTheme],
      isDark: resolvedTheme === 'dark',
      loaded,
      setThemeMode: async (mode: ThemeMode) => {
        setThemeModeState(mode);
        await AsyncStorage.setItem(STORAGE_KEY, mode);
      },
    }),
    [loaded, resolvedTheme, themeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
