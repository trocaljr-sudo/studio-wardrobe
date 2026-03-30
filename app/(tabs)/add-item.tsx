import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSession } from '../../lib/session';
import { type Category, createClothingItem, fetchCategories } from '../../lib/wardrobe';

export default function AddItemScreen() {
  const { user } = useSession();
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadCategories = async () => {
      try {
        const nextCategories = await fetchCategories();
        if (!mounted) {
          return;
        }

        setCategories(nextCategories);
      } catch {
        if (!mounted) {
          return;
        }

        setCategories([]);
      } finally {
        if (mounted) {
          setCategoriesLoading(false);
        }
      }
    };

    loadCategories();

    return () => {
      mounted = false;
    };
  }, []);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('Photo library access is required to attach an item image.');
      setSuccessMessage(null);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setSelectedImageUri(asset.uri);
    setSelectedImageMimeType(asset.mimeType ?? 'image/jpeg');
    setErrorMessage(null);
  };

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
        ownerId: user.id,
        name: name.trim(),
        color,
        categoryId: selectedCategoryId,
        imageUri: selectedImageUri,
        mimeType: selectedImageMimeType,
      });

      setName('');
      setColor('');
      setSelectedImageUri(null);
      setSelectedImageMimeType(null);
      setSelectedCategoryId(null);
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
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Add Item</Text>
          <Text style={styles.body}>
            Pick an image, choose a category if you want, and save the item to your active wardrobe.
          </Text>

          <View style={styles.form}>
            <Pressable onPress={handlePickImage} style={styles.imagePicker}>
              {selectedImageUri ? (
                <Image source={{ uri: selectedImageUri }} style={styles.previewImage} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Text style={styles.imagePlaceholderTitle}>Pick image</Text>
                  <Text style={styles.imagePlaceholderBody}>
                    Upload a photo for this clothing item
                  </Text>
                </View>
              )}
            </Pressable>

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

            <View style={styles.categoriesSection}>
              <Text style={styles.sectionLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categoryRow}>
                  <Pressable
                    onPress={() => setSelectedCategoryId(null)}
                    style={[
                      styles.categoryChip,
                      !selectedCategoryId && styles.categoryChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        !selectedCategoryId && styles.categoryChipTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </Pressable>

                  {categories.map((category) => {
                    const selected = selectedCategoryId === category.id;

                    return (
                      <Pressable
                        key={category.id}
                        onPress={() => setSelectedCategoryId(category.id)}
                        style={[styles.categoryChip, selected && styles.categoryChipActive]}
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            selected && styles.categoryChipTextActive,
                          ]}
                        >
                          {category.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              {categoriesLoading ? (
                <Text style={styles.categoryHelper}>Loading categories...</Text>
              ) : null}
            </View>

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

            <Pressable
              disabled={loading}
              onPress={handleSave}
              style={[styles.button, loading && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Save item'}</Text>
            </Pressable>
          </View>
        </ScrollView>
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
    padding: 24,
    paddingBottom: 48,
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
  imagePicker: {
    marginBottom: 4,
  },
  imagePlaceholder: {
    alignItems: 'center',
    backgroundColor: '#FFFDF9',
    borderColor: '#E7D8CA',
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 220,
    padding: 20,
  },
  imagePlaceholderTitle: {
    color: '#201A17',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  imagePlaceholderBody: {
    color: '#6B615A',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  previewImage: {
    borderRadius: 18,
    height: 220,
    width: '100%',
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
  categoriesSection: {
    gap: 10,
  },
  sectionLabel: {
    color: '#201A17',
    fontSize: 15,
    fontWeight: '700',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryChip: {
    backgroundColor: '#FFFDF9',
    borderColor: '#E7D8CA',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  categoryChipActive: {
    backgroundColor: '#201A17',
    borderColor: '#201A17',
  },
  categoryChipText: {
    color: '#6B615A',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#F7F1EB',
  },
  categoryHelper: {
    color: '#6B615A',
    fontSize: 13,
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
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#F7F1EB',
    fontSize: 16,
    fontWeight: '700',
  },
});
