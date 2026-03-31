import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSession } from '../../lib/session';
import {
  type Brand,
  type Category,
  type ClothingItem,
  deleteClothingItem,
  fetchBrands,
  fetchCategories,
  fetchClothingItemDetail,
  updateClothingItem,
} from '../../lib/wardrobe';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [item, setItem] = useState<ClothingItem | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [material, setMaterial] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [replacementImageUri, setReplacementImageUri] = useState<string | null>(null);
  const [replacementImageMimeType, setReplacementImageMimeType] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadMetadata = async () => {
      try {
        const [nextCategories, nextBrands] = await Promise.all([fetchCategories(), fetchBrands()]);

        if (!mounted) {
          return;
        }

        setCategories(nextCategories);
        setBrands(nextBrands);
      } catch {
        if (!mounted) {
          return;
        }

        setCategories([]);
        setBrands([]);
      }
    };

    loadMetadata();

    return () => {
      mounted = false;
    };
  }, []);

  const hydrateForm = useCallback((nextItem: ClothingItem | null) => {
    setItem(nextItem);
    setName(nextItem?.name ?? '');
    setColor(nextItem?.color ?? '');
    setSize(nextItem?.size ?? '');
    setMaterial(nextItem?.material ?? '');
    setSelectedCategoryId(nextItem?.category_id ?? null);
    setSelectedBrandId(nextItem?.brand_id ?? null);
    setReplacementImageUri(null);
    setReplacementImageMimeType(null);
  }, []);

  const loadItem = useCallback(async () => {
    if (!user || !id) {
      setLoading(false);
      setErrorMessage('Sign in again to view this item.');
      return;
    }

    setLoading(true);

    try {
      const nextItem = await fetchClothingItemDetail(id, user.id);

      if (!nextItem) {
        setErrorMessage('This item could not be found.');
        hydrateForm(null);
      } else {
        hydrateForm(nextItem);
        setErrorMessage(null);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load this item right now.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [hydrateForm, id, user]);

  useFocusEffect(
    useCallback(() => {
      loadItem();
    }, [loadItem])
  );

  const handlePickReplacementImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('Photo library access is required to replace the item image.');
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
    setReplacementImageUri(asset.uri);
    setReplacementImageMimeType(asset.mimeType ?? 'image/jpeg');
    setErrorMessage(null);
  };

  const handleSave = async () => {
    if (!user || !id || !item) {
      setErrorMessage('This item is no longer available.');
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

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const updatedItem = await updateClothingItem({
        itemId: id,
        ownerId: user.id,
        name,
        color,
        size,
        material,
        categoryId: selectedCategoryId,
        brandId: selectedBrandId,
        imageUri: replacementImageUri,
        mimeType: replacementImageMimeType,
      });

      hydrateForm(updatedItem);
      setEditing(false);
      setSuccessMessage('Item updated.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update this item right now.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!user || !id) {
      return;
    }

    Alert.alert(
      'Delete item?',
      'This will remove the item from your wardrobe. If it is still used in an outfit, deletion will be blocked.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            try {
              await deleteClothingItem(id, user.id);
              router.replace('/(tabs)/wardrobe');
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Unable to delete this item right now.';
              setErrorMessage(message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.loadingText}>Loading item...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Item unavailable</Text>
          <Text style={styles.body}>
            {errorMessage ?? 'This item is missing or you no longer have access to it.'}
          </Text>
          <Pressable onPress={() => router.replace('/(tabs)/wardrobe')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Back to wardrobe</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const previewUri = replacementImageUri ?? item.imageUrl;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.image} />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.imageFallbackText}>No image yet</Text>
            </View>
          )}

          <View style={styles.actionsRow}>
            <Pressable onPress={handlePickReplacementImage} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {item.image_path || replacementImageUri ? 'Replace photo' : 'Add photo'}
              </Text>
            </Pressable>
            {replacementImageUri ? (
              <Pressable
                onPress={() => {
                  setReplacementImageUri(null);
                  setReplacementImageMimeType(null);
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Use current photo</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{item.name || 'Untitled item'}</Text>
              <Text style={styles.subtitle}>
                {item.categoryName ?? 'No category'}{item.color?.trim() ? ` • ${item.color}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setEditing((current) => !current);
                setSuccessMessage(null);
                setErrorMessage(null);
                hydrateForm(item);
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>{editing ? 'Cancel' : 'Edit'}</Text>
            </Pressable>
          </View>

          {!editing ? (
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Category</Text>
              <Text style={styles.metaValue}>{item.categoryName ?? 'Not set'}</Text>

              <Text style={styles.metaLabel}>Color</Text>
              <Text style={styles.metaValue}>{item.color?.trim() ? item.color : 'Not set'}</Text>

              <Text style={styles.metaLabel}>Brand</Text>
              <Text style={styles.metaValue}>{item.brandName ?? 'Not set'}</Text>

              <Text style={styles.metaLabel}>Size</Text>
              <Text style={styles.metaValue}>{item.size?.trim() ? item.size : 'Not set'}</Text>

              <Text style={styles.metaLabel}>Material</Text>
              <Text style={styles.metaValue}>
                {item.material?.trim() ? item.material : 'Not set'}
              </Text>
            </View>
          ) : (
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

              <View style={styles.selectorSection}>
                <Text style={styles.selectorLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {categories.map((category) => (
                      <Pressable
                        key={category.id}
                        onPress={() => setSelectedCategoryId(category.id)}
                        style={[
                          styles.chip,
                          selectedCategoryId === category.id && styles.chipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selectedCategoryId === category.id && styles.chipTextActive,
                          ]}
                        >
                          {category.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View style={styles.selectorSection}>
                <Text style={styles.selectorLabel}>Brand</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    <Pressable
                      onPress={() => setSelectedBrandId(null)}
                      style={[styles.chip, !selectedBrandId && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, !selectedBrandId && styles.chipTextActive]}>
                        None
                      </Text>
                    </Pressable>
                    {brands.map((brand) => (
                      <Pressable
                        key={brand.id}
                        onPress={() => setSelectedBrandId(brand.id)}
                        style={[
                          styles.chip,
                          selectedBrandId === brand.id && styles.chipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selectedBrandId === brand.id && styles.chipTextActive,
                          ]}
                        >
                          {brand.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

          {editing ? (
            <Pressable
              disabled={saving}
              onPress={handleSave}
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save changes'}</Text>
            </Pressable>
          ) : null}

          <Pressable
            disabled={deleting}
            onPress={handleDelete}
            style={[styles.deleteButton, deleting && styles.buttonDisabled]}
          >
            <Text style={styles.deleteButtonText}>{deleting ? 'Deleting...' : 'Delete item'}</Text>
          </Pressable>
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
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  loadingText: {
    color: '#5D534C',
    fontSize: 15,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  backButtonText: {
    color: '#8C5E3C',
    fontSize: 15,
    fontWeight: '600',
  },
  image: {
    width: '100%',
    height: 320,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  imageFallback: {
    width: '100%',
    height: 320,
    borderRadius: 24,
    backgroundColor: '#FFFDF9',
    borderWidth: 1,
    borderColor: '#E7D8CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    color: '#8B8B95',
    fontSize: 15,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 22,
    marginBottom: 20,
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: '#201A17',
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    color: '#5D534C',
    fontSize: 15,
    lineHeight: 22,
  },
  body: {
    color: '#5D534C',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  metaCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E7D8CA',
    padding: 18,
    gap: 4,
  },
  metaLabel: {
    color: '#8C5E3C',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: '#201A17',
    fontSize: 16,
    lineHeight: 23,
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
  selectorSection: {
    gap: 10,
  },
  selectorLabel: {
    color: '#201A17',
    fontSize: 15,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    backgroundColor: '#FFFDF9',
    borderColor: '#E7D8CA',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: '#201A17',
    borderColor: '#201A17',
  },
  chipText: {
    color: '#6B615A',
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#F7F1EB',
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
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#201A17',
    borderRadius: 16,
    marginTop: 20,
    paddingVertical: 15,
  },
  primaryButtonText: {
    color: '#F7F1EB',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButton: {
    alignItems: 'center',
    borderColor: '#C78080',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    paddingVertical: 15,
  },
  deleteButtonText: {
    color: '#A13737',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  error: {
    color: '#A13737',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
  success: {
    color: '#2F6D45',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
});
