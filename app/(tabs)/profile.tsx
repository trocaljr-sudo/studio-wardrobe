import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AmbientBackground } from '../../lib/ambient-background';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { type ThemeMode, useTheme } from '../../lib/theme';

export default function ProfileScreen() {
  const { user } = useSession();
  const { colors, isDark, resolvedTheme, setThemeMode, themeMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [themeLoading, setThemeLoading] = useState(false);
  const styles = createStyles(colors);

  const handleSignOut = async () => {
    setLoading(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.signOut();
    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
    }
  };

  const handleThemeModeChange = async (mode: ThemeMode) => {
    setThemeLoading(true);
    setErrorMessage(null);

    try {
      await setThemeMode(mode);
    } catch {
      setErrorMessage('Unable to update the appearance setting right now.');
    } finally {
      setThemeLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AmbientBackground />
      <View style={styles.container}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.body}>
          Signed in as {user?.email ?? 'your account'}.
        </Text>
        <Text style={styles.body}>
          Tune the look of Studio Wardrobe and manage your session from here.
        </Text>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.helperText}>
            Current look: {resolvedTheme === 'dark' ? 'Dark mode' : 'Light mode'}
          </Text>
          <View style={styles.themeRow}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => {
              const selected = themeMode === mode;
              const label =
                mode === 'system' ? 'Use system' : mode === 'light' ? 'Light' : 'Dark';

              return (
                <Pressable
                  key={mode}
                  disabled={themeLoading}
                  onPress={() => handleThemeModeChange(mode)}
                  style={[styles.themeButton, selected && styles.themeButtonActive]}
                >
                  <Text
                    style={[styles.themeButtonText, selected && styles.themeButtonTextActive]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Session</Text>
          <Text style={styles.helperText}>
            {isDark
              ? 'Dark mode keeps the styling studio mood from the original app.'
              : 'Light mode keeps things bright while preserving the same structure.'}
          </Text>
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <Pressable
          disabled={loading}
          onPress={handleSignOut}
          style={[styles.button, loading && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{loading ? 'Signing out...' : 'Sign out'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 16,
    },
    title: {
      color: colors.text,
      fontSize: 34,
      fontWeight: '800',
      marginBottom: 6,
    },
    body: {
      color: colors.textMuted,
      fontSize: 16,
      lineHeight: 24,
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      padding: 18,
      gap: 10,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    helperText: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    themeRow: {
      gap: 10,
    },
    themeButton: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    themeButtonActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    themeButtonText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '700',
    },
    themeButtonTextActive: {
      color: colors.accentText,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20,
    },
    button: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.text,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    buttonText: {
      color: colors.accentText,
      fontSize: 15,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
  });
