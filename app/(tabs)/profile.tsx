import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const { user } = useSession();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignOut = async () => {
    setLoading(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.signOut();
    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.body}>
          Signed in as {user?.email ?? 'your account'}.
        </Text>
        <Text style={styles.body}>Manage your Studio Wardrobe session from here.</Text>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <Pressable onPress={handleSignOut} style={styles.button}>
          <Text style={styles.buttonText}>{loading ? 'Signing out...' : 'Sign out'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F1EA',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#201A17',
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    color: '#5D534C',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  error: {
    color: '#A13737',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#201A17',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#F7F1EB',
    fontSize: 15,
    fontWeight: '700',
  },
});
