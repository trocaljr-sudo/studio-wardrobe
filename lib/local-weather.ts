import AsyncStorage from '@react-native-async-storage/async-storage';

export type DetectedWeatherMode = 'any' | 'cold' | 'mild' | 'warm' | 'rainy';

type WeatherDetection = {
  cached?: boolean;
  mode: DetectedWeatherMode;
  summary: string;
};

export const WEATHER_CACHE_KEY = 'studio-wardrobe-local-weather';

function formatTemperature(value: number) {
  return `${Math.round(value)}°F`;
}

function classifyWeatherMode(input: { precipitation: number; temperature: number; weatherCode: number }) {
  const { precipitation, temperature, weatherCode } = input;
  const rainyCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

  if (precipitation > 0.05 || rainyCodes.has(weatherCode)) {
    return 'rainy' as const;
  }

  if (temperature <= 50) {
    return 'cold' as const;
  }

  if (temperature >= 75) {
    return 'warm' as const;
  }

  return 'mild' as const;
}

export async function detectLocalWeatherMode(): Promise<WeatherDetection> {
  const Location = await import('expo-location');
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    throw new Error('Location permission is needed to use local weather.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,weather_code&temperature_unit=fahrenheit`
  );

  if (!response.ok) {
    const cached = await AsyncStorage.getItem(WEATHER_CACHE_KEY);

    if (cached) {
      const parsed = JSON.parse(cached) as WeatherDetection;
      return { ...parsed, cached: true };
    }

    throw new Error('Unable to reach the weather service right now.');
  }

  const json = (await response.json()) as {
    current?: {
      precipitation?: number;
      temperature_2m?: number;
      weather_code?: number;
    };
  };

  const temperature = json.current?.temperature_2m;
  const precipitation = json.current?.precipitation ?? 0;
  const weatherCode = json.current?.weather_code ?? 0;

  if (typeof temperature !== 'number') {
    throw new Error('Local weather is unavailable right now.');
  }

  const mode = classifyWeatherMode({
    precipitation,
    temperature,
    weatherCode,
  });

  const condition =
    mode === 'rainy'
      ? 'Rainy'
      : mode === 'cold'
        ? 'Cold'
        : mode === 'warm'
          ? 'Warm'
          : 'Mild';

  const detection = {
    mode,
    summary: `${condition} near you · ${formatTemperature(temperature)}`,
  };

  await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(detection));

  return detection;
}
