import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { AmbientBackground } from '../../lib/ambient-background';
import { useTheme } from '../../lib/theme';

export default function SignInScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const styles = createStyles(colors);

  const formatAuthError = (message: string) => {
    const normalized = message.toLowerCase();

    if (
      normalized.includes('invalid login credentials') ||
      normalized.includes('invalid credentials')
    ) {
      return 'That email and password combination did not work. Check your details and try again.';
    }

    if (normalized.includes('email not confirmed')) {
      return 'Check your email to confirm your account, then try signing in again.';
    }

    return message;
  };

  const handleSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setErrorMessage('Enter your email and password to continue.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });
    setLoading(false);

    if (error) {
      setErrorMessage(formatAuthError(error.message));
      return;
    }

    router.replace('/(tabs)/wardrobe');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AmbientBackground />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.container}
      >
        <View style={styles.content}>
          <Text style={styles.eyebrow}>Studio Wardrobe</Text>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            Step back into your digital wardrobe and keep every piece organized.
          </Text>

          <View style={styles.form}>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              value={email}
            />
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <Pressable
              disabled={loading}
              onPress={handleSignIn}
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Text>
            </Pressable>
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>

          <Link href="/(auth)/sign-up" style={styles.link}>
            Need an account? Sign up
          </Link>
        </View>
      </KeyboardAvoidingView>
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
    },
    content: {
      alignSelf: 'center',
      flex: 1,
      justifyContent: 'center',
      maxWidth: 520,
      paddingHorizontal: 24,
      width: '100%',
      gap: 18,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    title: {
      color: colors.text,
      fontSize: 42,
      fontWeight: '800',
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 16,
      lineHeight: 24,
    },
    form: {
      gap: 12,
      marginTop: 10,
    },
    input: {
      backgroundColor: colors.input,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      color: colors.text,
      fontSize: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: 18,
      marginTop: 8,
      paddingVertical: 15,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: colors.accentText,
      fontSize: 16,
      fontWeight: '700',
    },
    link: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: '600',
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20,
    },
  });
