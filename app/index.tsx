import { Redirect } from 'expo-router';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AmbientBackground } from '../lib/ambient-background';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';

export default function IndexScreen() {
  const { initialized, session } = useSession();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  if (!initialized) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AmbientBackground />
        <View style={styles.container}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.text}>Loading Studio Wardrobe...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)/wardrobe" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      padding: 24,
    },
    text: {
      color: colors.textMuted,
      fontSize: 15,
    },
  });
