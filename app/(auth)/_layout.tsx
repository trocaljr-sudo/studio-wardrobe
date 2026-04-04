import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackground } from '../../lib/ambient-background';
import { useSession } from '../../lib/session';
import { useTheme } from '../../lib/theme';

export default function AuthLayout() {
  const { initialized, session } = useSession();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  if (!initialized) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AmbientBackground />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} size="small" />
        </View>
      </SafeAreaView>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)/wardrobe" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });
