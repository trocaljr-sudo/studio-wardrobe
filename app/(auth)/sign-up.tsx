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

export default function SignUpScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const styles = createStyles(colors);

  const formatSignUpError = (message: string) => {
    const normalized = message.toLowerCase();

    if (normalized.includes('already registered') || normalized.includes('already been registered')) {
      return 'That email already has an account. Try signing in instead.';
    }

    if (normalized.includes('password')) {
      return 'Use a stronger password and try again.';
    }

    return message;
  };

  const handleSignUp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setErrorMessage('Enter your email and password to create an account.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: normalizedPassword,
    });
    setLoading(false);

    if (error) {
      setErrorMessage(formatSignUpError(error.message));
      return;
    }

    if (data.session) {
      router.replace('/(tabs)/wardrobe');
      return;
    }

    setSuccessMessage(
      'Account created. Check your email if confirmation is enabled, then sign in.'
    );
    router.replace('/(auth)/sign-in');
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
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Build your wardrobe archive, save looks, and keep every piece within reach.
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
              onPress={handleSignUp}
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Creating account...' : 'Sign up'}
              </Text>
            </Pressable>
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
          </View>

          <Link href="/(auth)/sign-in" style={styles.link}>
            Already have an account? Sign in
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
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
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
    success: {
      color: colors.success,
      fontSize: 14,
      lineHeight: 20,
    },
  });
