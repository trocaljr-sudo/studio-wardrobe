import { router } from 'expo-router';
import { type Dispatch, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

import { createOutfit, fetchOccasions, fetchSelectableClothingItems } from '../../lib/outfits';
import { useSession } from '../../lib/session';
import { type ClothingItem, type Tag, fetchTags } from '../../lib/wardrobe';

type Occasion = {
  id: string;
  name: string;
};

export default function NewOutfitScreen() {
  const { user } = useSession();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedOccasionIds, setSelectedOccasionIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      if (!user) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      try {
        const [nextItems, nextOccasions, nextTags] = await Promise.all([
          fetchSelectableClothingItems(user.id),
          fetchOccasions(),
          fetchTags(),
        ]);

        if (!mounted) {
          return;
        }

        setItems(nextItems);
        setOccasions(nextOccasions);
        setTags(nextTags);
      } catch (error) {
        if (!mounted) {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Unable to load the outfit builder right now.';
        setErrorMessage(message);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [user]);

  const toggleSelection = (
    id: string,
    setter: Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const handleSave = async () => {
    if (!user) {
      setErrorMessage('Sign in again before creating an outfit.');
      return;
    }

    if (!name.trim()) {
      setErrorMessage('Give the outfit a name before saving.');
      return;
    }

    if (selectedItemIds.length === 0) {
      setErrorMessage('Select at least one clothing item for the outfit.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));

      await createOutfit({
        ownerId: user.id,
        name: name.trim(),
        description,
        clothingItems: selectedItems,
        occasionIds: selectedOccasionIds,
        tagIds: selectedTagIds,
      });

      router.replace('/(tabs)/outfits');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save this outfit right now.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.helperText}>Loading outfit builder...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Create Outfit</Text>
          <Text style={styles.body}>
            Select pieces from your wardrobe, add occasions or tags, and save the look.
          </Text>

          <TextInput
            onChangeText={setName}
            placeholder="Outfit name"
            placeholderTextColor="#8B8B95"
            style={styles.input}
            value={name}
          />
          <TextInput
            multiline
            onChangeText={setDescription}
            placeholder="Description or notes"
            placeholderTextColor="#8B8B95"
            style={[styles.input, styles.textArea]}
            value={description}
          />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select items</Text>
            <View style={styles.itemsGrid}>
              {items.map((item) => {
                const selected = selectedItemIds.includes(item.id);

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleSelection(item.id, setSelectedItemIds)}
                    style={[styles.itemCard, selected && styles.itemCardSelected]}
                  >
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
                    ) : (
                      <View style={styles.itemImagePlaceholder}>
                        <Text style={styles.itemImagePlaceholderText}>No image</Text>
                      </View>
                    )}
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {item.categoryName ?? item.color ?? 'Wardrobe item'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Occasions</Text>
            <View style={styles.chipWrap}>
              {occasions.map((occasion) => {
                const selected = selectedOccasionIds.includes(occasion.id);

                return (
                  <Pressable
                    key={occasion.id}
                    onPress={() => toggleSelection(occasion.id, setSelectedOccasionIds)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {occasion.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tags</Text>
            <View style={styles.chipWrap}>
              {tags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);

                return (
                  <Pressable
                    key={tag.id}
                    onPress={() => toggleSelection(tag.id, setSelectedTagIds)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {tag.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <Pressable
            disabled={saving}
            onPress={handleSave}
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save outfit'}</Text>
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
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  helperText: {
    color: '#5D534C',
    fontSize: 15,
  },
  backButton: {
    marginBottom: 16,
  },
  backText: {
    color: '#8C5E3C',
    fontSize: 15,
    fontWeight: '600',
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
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7D8CA',
    borderRadius: 16,
    borderWidth: 1,
    color: '#201A17',
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    color: '#201A17',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7D8CA',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    width: '47%',
  },
  itemCardSelected: {
    borderColor: '#201A17',
    borderWidth: 2,
  },
  itemImage: {
    height: 120,
    width: '100%',
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    backgroundColor: '#EFE6DE',
    height: 120,
    justifyContent: 'center',
    width: '100%',
  },
  itemImagePlaceholderText: {
    color: '#8E837A',
    fontSize: 13,
    fontWeight: '600',
  },
  itemName: {
    color: '#201A17',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  itemMeta: {
    color: '#6B615A',
    fontSize: 13,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  chipSelected: {
    backgroundColor: '#201A17',
    borderColor: '#201A17',
  },
  chipText: {
    color: '#6B615A',
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#F7F1EB',
  },
  error: {
    color: '#A13737',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#201A17',
    borderRadius: 16,
    marginTop: 24,
    paddingVertical: 15,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#F7F1EB',
    fontSize: 16,
    fontWeight: '700',
  },
});
