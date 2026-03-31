import { router, useLocalSearchParams } from 'expo-router';
import { type Dispatch, useEffect, useState } from 'react';
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

import { AmbientBackground } from '../../lib/ambient-background';
import { deleteOutfit, fetchOccasions, fetchOutfitDetail, fetchSelectableClothingItems, updateOutfit, type Occasion } from '../../lib/outfits';
import { fetchPersonalizationSnapshot, recordFeedback, toggleFavoriteOutfit } from '../../lib/personalization';
import { useSession } from '../../lib/session';
import { useTheme } from '../../lib/theme';
import { type ClothingItem, type Tag, fetchTags } from '../../lib/wardrobe';

export default function OutfitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchOutfitDetail>> | null>(null);
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);
  const [allOccasions, setAllOccasions] = useState<Occasion[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedOccasionIds, setSelectedOccasionIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [favoriteOutfitIds, setFavoriteOutfitIds] = useState<string[]>([]);
  const [outfitFeedback, setOutfitFeedback] = useState<'like' | 'dislike' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      if (!user || !id) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      try {
        const [nextDetail, nextItems, nextOccasions, nextTags, personalization] = await Promise.all([
          fetchOutfitDetail(user.id, id),
          fetchSelectableClothingItems(user.id),
          fetchOccasions(),
          fetchTags(),
          fetchPersonalizationSnapshot(user.id),
        ]);

        if (!mounted) {
          return;
        }

        setDetail(nextDetail);
        setAllItems(nextItems);
        setAllOccasions(nextOccasions);
        setAllTags(nextTags);
        setName(nextDetail.name);
        setDescription(nextDetail.description ?? '');
        setSelectedItemIds(nextDetail.items.map((item) => item.id));
        setSelectedOccasionIds(nextDetail.occasions.map((occasion) => occasion.id));
        setSelectedTagIds(nextDetail.tags.map((tag) => tag.id));
        setFavoriteOutfitIds(personalization.favoriteOutfitIds);
        setOutfitFeedback(personalization.outfitFeedback[id] ?? null);
      } catch (error) {
        if (!mounted) {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Unable to load this outfit right now.';
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
  }, [id, user]);

  const toggleSelection = (value: string, setter: Dispatch<React.SetStateAction<string[]>>) => {
    setter((current) =>
      current.includes(value) ? current.filter((existing) => existing !== value) : [...current, value]
    );
  };

  const handleSave = async () => {
    if (!user || !id) {
      setErrorMessage('Sign in again before editing this outfit.');
      return;
    }

    if (!name.trim()) {
      setErrorMessage('Give the outfit a name before saving.');
      return;
    }

    if (selectedItemIds.length === 0) {
      setErrorMessage('Keep at least one clothing item in the outfit.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const selectedItems = allItems.filter((item) => selectedItemIds.includes(item.id));

      await updateOutfit({
        outfitId: id,
        ownerId: user.id,
        name: name.trim(),
        description,
        clothingItems: selectedItems,
        occasionIds: selectedOccasionIds,
        tagIds: selectedTagIds,
      });

      const refreshedDetail = await fetchOutfitDetail(user.id, id);
      setDetail(refreshedDetail);
      setEditing(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save changes right now.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete outfit?', 'This will permanently remove the outfit and its linked selections.', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!user || !id) {
            return;
          }

          setDeleting(true);
          setErrorMessage(null);

          try {
            await deleteOutfit(user.id, id);
            router.replace('/(tabs)/outfits');
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Unable to delete this outfit right now.';
            setErrorMessage(message);
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleToggleFavorite = async () => {
    if (!user || !id) {
      return;
    }

    try {
      const nextProfile = await toggleFavoriteOutfit(user.id, id);
      setFavoriteOutfitIds(nextProfile.favoriteOutfitIds);
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update favorites right now.';
      setErrorMessage(message);
    }
  };

  const handleFeedback = async (signal: 'like' | 'dislike') => {
    if (!user || !id) {
      return;
    }

    try {
      await recordFeedback({
        userId: user.id,
        targetType: 'outfit',
        targetId: id,
        signal,
        source: 'manual',
      });
      setOutfitFeedback(signal);
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save that feedback right now.';
      setErrorMessage(message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.helperText}>Loading outfit...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.helperText}>Outfit not found.</Text>
          <Pressable onPress={() => router.replace('/(tabs)/outfits')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to outfits</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <AmbientBackground />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          {detail.imageUrl ? (
            <Image source={{ uri: detail.imageUrl }} style={styles.heroImage} />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text style={styles.heroPlaceholderText}>No preview image</Text>
            </View>
          )}

          {editing ? (
            <>
              <TextInput
                onChangeText={setName}
                placeholder="Outfit name"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                value={name}
              />
              <TextInput
                multiline
                onChangeText={setDescription}
                placeholder="Description or notes"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, styles.textArea]}
                value={description}
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>{detail.name}</Text>
              {detail.description ? <Text style={styles.body}>{detail.description}</Text> : null}
              {detail.created_at ? (
                <Text style={styles.meta}>Created {new Date(detail.created_at).toLocaleDateString()}</Text>
              ) : null}
              <View style={styles.feedbackRow}>
                <Pressable onPress={handleToggleFavorite} style={styles.feedbackChip}>
                  <Text style={styles.feedbackChipText}>
                    {favoriteOutfitIds.includes(id) ? '♥ Favorite' : '♡ Favorite'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleFeedback('like')}
                  style={[styles.feedbackChip, outfitFeedback === 'like' && styles.feedbackChipActive]}
                >
                  <Text
                    style={[
                      styles.feedbackChipText,
                      outfitFeedback === 'like' && styles.feedbackChipTextActive,
                    ]}
                  >
                    👍 Like
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleFeedback('dislike')}
                  style={[styles.feedbackChip, outfitFeedback === 'dislike' && styles.feedbackChipActive]}
                >
                  <Text
                    style={[
                      styles.feedbackChipText,
                      outfitFeedback === 'dislike' && styles.feedbackChipTextActive,
                    ]}
                  >
                    👎 Dislike
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Items</Text>
            <View style={styles.itemsGrid}>
              {(editing ? allItems : detail.items).map((item) => {
                const selected = selectedItemIds.includes(item.id);

                return (
                  <Pressable
                    disabled={!editing}
                    key={item.id}
                    onPress={() => toggleSelection(item.id, setSelectedItemIds)}
                    style={[styles.itemCard, editing && selected && styles.itemCardSelected]}
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
                      {[item.categoryName, item.color].filter(Boolean).join(' · ') || 'Wardrobe item'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Occasions</Text>
            <View style={styles.chipWrap}>
              {(editing ? allOccasions : detail.occasions).map((occasion) => {
                const selected = selectedOccasionIds.includes(occasion.id);

                return (
                  <Pressable
                    disabled={!editing}
                    key={occasion.id}
                    onPress={() => toggleSelection(occasion.id, setSelectedOccasionIds)}
                    style={[styles.chip, editing && selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, editing && selected && styles.chipTextSelected]}>
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
              {(editing ? allTags : detail.tags).map((tag) => {
                const selected = selectedTagIds.includes(tag.id);

                return (
                  <Pressable
                    disabled={!editing}
                    key={tag.id}
                    onPress={() => toggleSelection(tag.id, setSelectedTagIds)}
                    style={[styles.chip, editing && selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, editing && selected && styles.chipTextSelected]}>
                      {tag.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          {editing ? (
            <View style={styles.actionRow}>
              <Pressable disabled={saving} onPress={() => setEditing(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={handleSave}
                style={[styles.primaryButton, saving && styles.disabledButton]}
              >
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save changes'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <Pressable onPress={() => setEditing(true)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Edit</Text>
              </Pressable>
              <Pressable
                disabled={deleting}
                onPress={confirmDelete}
                style={[styles.deleteButton, deleting && styles.disabledButton]}
              >
                <Text style={styles.deleteButtonText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
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
    padding: 24,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  backButton: {
    marginBottom: 16,
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  heroImage: {
    borderRadius: 20,
    height: 220,
    marginBottom: 18,
    width: '100%',
  },
  heroPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderRadius: 20,
    height: 220,
    justifyContent: 'center',
    marginBottom: 18,
    width: '100%',
  },
  heroPlaceholderText: {
    color: colors.textSubtle,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 10,
  },
  body: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 10,
  },
  feedbackRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  feedbackChip: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feedbackChipActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  feedbackChipText: {
    color: colors.text,
    fontWeight: '700',
  },
  feedbackChipTextActive: {
    color: colors.accent,
  },
  meta: {
    color: colors.accent,
    fontSize: 14,
    marginBottom: 18,
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
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
    color: colors.text,
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
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    width: '47%',
  },
  itemCardSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  itemImage: {
    height: 120,
    width: '100%',
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    height: 120,
    justifyContent: 'center',
    width: '100%',
  },
  itemImagePlaceholderText: {
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: '600',
  },
  itemName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  itemMeta: {
    color: colors.textMuted,
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.accentText,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 16,
    flex: 1,
    paddingVertical: 15,
  },
  primaryButtonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 15,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 16,
    flex: 1,
    paddingVertical: 15,
  },
  deleteButtonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
