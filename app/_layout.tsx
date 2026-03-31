import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AmbientBackground } from '../lib/ambient-background';
import { SessionProvider } from '../lib/session';
import { ThemeProvider, useTheme } from '../lib/theme';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AmbientBackground />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="items/[id]" />
        <Stack.Screen name="style-ai/index" />
      </Stack>
    </View>
  );
}
