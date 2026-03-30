import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSession } from '../../lib/session';
import { createClothingItem } from '../../lib/wardrobe';

export default function AddItemScreen() {
  const { user } = useSession();
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSave = async () => {
    if (!user) {
      setErrorMessage('Sign in again before adding an item.');
      setSuccessMessage(null);
      return;
    }

    if (!name.trim()) {
      setErrorMessage('Add an item name before saving.');
      setSuccessMessage(null);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await createClothingItem({
        userId: user.id,
        name: name.trim(),
        color,
      });

      setName('');
      setColor('');
      setSuccessMessage('Item saved to your wardrobe.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save this item right now.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.container}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Add Item</Text>
          <Text style={styles.body}>
            Save a simple clothing item to your active wardrobe with the fields we know are valid.
          </Text>

          <View style={styles.form}>
            <TextInput
              onChangeText={setName}
              placeholder="Item name"
              placeholderTextColor="#8B8B95"
              style={styles.input}
              value={name}
            />
            <TextInput
              onChangeText={setColor}
              placeholder="Color"
              placeholderTextColor="#8B8B95"
              style={styles.input}
              value={color}
            />

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

            <Pressable onPress={handleSave} style={styles.button}>
              <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Save item'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
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
    marginBottom: 18,
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7D8CA',
    borderRadius: 16,
    borderWidth: 1,
    color: '#201A17',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: {
    color: '#A13737',
    fontSize: 14,
    lineHeight: 20,
  },
  success: {
    color: '#2F6D45',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#201A17',
    borderRadius: 16,
    marginTop: 4,
    paddingVertical: 15,
  },
  buttonText: {
    color: '#F7F1EB',
    fontSize: 16,
    fontWeight: '700',
  },
});
