import AsyncStorage from '@react-native-async-storage/async-storage';

import { THEME_MODE_STORAGE_KEY } from './theme';
import { WEATHER_CACHE_KEY } from './local-weather';

export type AppSettings = {
  analyticsEnabled: boolean;
  notificationsEnabled: boolean;
  weatherAssistEnabled: boolean;
};

export type AppStorageDebug = {
  hasThemePreference: boolean;
  hasWeatherCache: boolean;
};

const APP_SETTINGS_KEY = 'studio-wardrobe-app-settings';

const DEFAULT_SETTINGS: AppSettings = {
  analyticsEnabled: true,
  notificationsEnabled: false,
  weatherAssistEnabled: true,
};

export async function fetchAppSettings() {
  const raw = await AsyncStorage.getItem(APP_SETTINGS_KEY);

  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;

    return {
      analyticsEnabled:
        typeof parsed.analyticsEnabled === 'boolean'
          ? parsed.analyticsEnabled
          : DEFAULT_SETTINGS.analyticsEnabled,
      notificationsEnabled:
        typeof parsed.notificationsEnabled === 'boolean'
          ? parsed.notificationsEnabled
          : DEFAULT_SETTINGS.notificationsEnabled,
      weatherAssistEnabled:
        typeof parsed.weatherAssistEnabled === 'boolean'
          ? parsed.weatherAssistEnabled
          : DEFAULT_SETTINGS.weatherAssistEnabled,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateAppSettings(nextSettings: AppSettings) {
  await AsyncStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

export async function fetchAppStorageDebug(): Promise<AppStorageDebug> {
  const [themePreference, weatherCache] = await Promise.all([
    AsyncStorage.getItem(THEME_MODE_STORAGE_KEY),
    AsyncStorage.getItem(WEATHER_CACHE_KEY),
  ]);

  return {
    hasThemePreference: !!themePreference,
    hasWeatherCache: !!weatherCache,
  };
}
