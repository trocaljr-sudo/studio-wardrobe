import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
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
import {
  type Brand,
  type Category,
  type Tag,
  createClothingItem,
  fetchBrands,
  fetchCategories,
  fetchTags,
} from '../../lib/wardrobe';

export default function AddItemScreen() {
  const { user } = useSession();
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [material, setMaterial] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadMetadata = async () => {
      try {
        const [nextCategories, nextBrands, nextTags] = await Promise.all([
          fetchCategories(),
          fetchBrands(),
          fetchTags(),
        ]);

        if (!mounted) {
          return;
        }

        setCategories(nextCategories);
        setBrands(nextBrands);
        setTags(nextTags);
      } catch {
        if (!mounted) {
          return;
        }

        setCategories([]);
        setBrands([]);
        setTags([]);
      } finally {
        if (mounted) {
          setCategoriesLoading(false);
          setBrandsLoading(false);
          setTagsLoading(false);
        }
      }
    };

    loadMetadata();

    return () => {
      mounted = false;
    };
  }, []);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((existingTagId) => existingTagId !== tagId)
        : [...current, tagId]
    );
  };

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

  const handleRemoveImage = () => {
    setSelectedImageUri(null);
    setSelectedImageMimeType(null);
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

    if (!selectedCategoryId) {
      setErrorMessage('Choose a category before saving.');
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
        size,
        material,
        categoryId: selectedCategoryId,
        brandId: selectedBrandId,
        tagIds: selectedTagIds,
        imageUri: selectedImageUri,
        mimeType: selectedImageMimeType,
      });

      setName('');
      setColor('');
      setSize('');
      setMaterial('');
      setSelectedImageUri(null);
      setSelectedImageMimeType(null);
      setSelectedCategoryId(null);
      setSelectedBrandId(null);
      setSelectedTagIds([]);
      setSuccessMessage('Item saved to your wardrobe.');
      router.replace('/(tabs)/wardrobe');
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
            Build a real wardrobe entry with structured metadata you can browse later.
          </Text>

          <View style={styles.form}>
            <Pressable onPress={handlePickImage} style={styles.imagePicker}>
              {selectedImageUri ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: selectedImageUri }} style={styles.previewImage} />
                  <View style={styles.imageActions}>
                    <Pressable onPress={handlePickImage} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Change photo</Text>
                    </Pressable>
                    <Pressable onPress={handleRemoveImage} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Remove photo</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Text style={styles.imagePlaceholderTitle}>Pick image</Text>
                  <Text style={styles.imagePlaceholderBody}>
                    Upload a photo for this clothing item. You can still save without one.
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
            <TextInput
              onChangeText={setSize}
              placeholder="Size"
              placeholderTextColor="#8B8B95"
              style={styles.input}
              value={size}
            />
            <TextInput
              onChangeText={setMaterial}
              placeholder="Material"
              placeholderTextColor="#8B8B95"
              style={styles.input}
              value={material}
            />

            <View style={styles.categoriesSection}>
              <Text style={styles.sectionLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categoryRow}>
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
              ) : categories.length === 0 ? (
                <Text style={styles.categoryHelper}>Categories are unavailable right now.</Text>
              ) : null}
            </View>

            <View style={styles.categoriesSection}>
              <Text style={styles.sectionLabel}>Brand</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categoryRow}>
                  <Pressable
                    onPress={() => setSelectedBrandId(null)}
                    style={[styles.categoryChip, !selectedBrandId && styles.categoryChipActive]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        !selectedBrandId && styles.categoryChipTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </Pressable>

                  {brands.map((brand) => {
                    const selected = selectedBrandId === brand.id;

                    return (
                      <Pressable
                        key={brand.id}
                        onPress={() => setSelectedBrandId(brand.id)}
                        style={[styles.categoryChip, selected && styles.categoryChipActive]}
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            selected && styles.categoryChipTextActive,
                          ]}
                        >
                          {brand.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              {brandsLoading ? (
                <Text style={styles.categoryHelper}>Loading brands...</Text>
              ) : brands.length === 0 ? (
                <Text style={styles.categoryHelper}>No brands available yet.</Text>
              ) : null}
            </View>

            <View style={styles.categoriesSection}>
              <Text style={styles.sectionLabel}>Tags</Text>
              <View style={styles.tagsWrap}>
                {tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);

                  return (
                    <Pressable
                      key={tag.id}
                      onPress={() => toggleTag(tag.id)}
                      style={[styles.categoryChip, selected && styles.categoryChipActive]}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          selected && styles.categoryChipTextActive,
                        ]}
                      >
                        {tag.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {tagsLoading ? (
                <Text style={styles.categoryHelper}>Loading tags...</Text>
              ) : tags.length === 0 ? (
                <Text style={styles.categoryHelper}>No tags available yet.</Text>
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
  previewWrap: {
    gap: 10,
  },
  imageActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    backgroundColor: '#FFFDF9',
    borderColor: '#E7D8CA',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#5D534C',
    fontSize: 13,
    fontWeight: '600',
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
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
