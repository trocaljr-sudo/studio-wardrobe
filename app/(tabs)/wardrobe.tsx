import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '../../lib/session';
import { AmbientBackground } from '../../lib/ambient-background';
import { useTheme } from '../../lib/theme';
import { fetchPersonalizationSnapshot, toggleFavoriteItem } from '../../lib/personalization';
import { fetchRecommendations, type RecommendedOutfit } from '../../lib/recommendations';
import {
  type Brand,
  type Category,
  type ClothingItem,
  type Tag,
  fetchBrands,
  fetchCategories,
  fetchTags,
  fetchWardrobeItems,
} from '../../lib/wardrobe';

export default function WardrobeScreen() {
  const { user } = useSession();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'catalog' | 'list'>('catalog');
  const [favoriteItemIds, setFavoriteItemIds] = useState<string[]>([]);
  const [todaySuggestion, setTodaySuggestion] = useState<RecommendedOutfit | null>(null);
  const [todayContext, setTodayContext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadMetadata = async () => {
      try {
        const [nextCategories, nextBrands, nextTags] = await Promise.all([
          fetchCategories(),
          fetchBrands(),
          fetchTags(),
        ]);

        if (mounted) {
          setCategories(nextCategories);
          setBrands(nextBrands);
          setTags(nextTags);
        }
      } catch {
        if (mounted) {
          setCategories([]);
          setBrands([]);
          setTags([]);
        }
      }
    };

    loadMetadata();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchText.trim().toLowerCase());
    }, 250);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchText]);

  const loadItems = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!user) {
        setItems([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [{ items: nextItems }, personalization, recommendationState] = await Promise.all([
          fetchWardrobeItems(user.id),
          fetchPersonalizationSnapshot(user.id),
          fetchRecommendations(user.id),
        ]);
        setItems(nextItems);
        setFavoriteItemIds(personalization.favoriteItemIds);
        setTodaySuggestion(recommendationState.todaySuggestions[0] ?? null);
        setTodayContext(recommendationState.todayContext ?? null);
        setErrorMessage(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load your wardrobe right now.';
        setErrorMessage(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((value) => value !== tagId) : [...current, tagId]
    );
  };

  const clearAllFilters = () => {
    setSearchText('');
    setDebouncedSearch('');
    setSelectedCategoryId(null);
    setSelectedBrandId(null);
    setSelectedTagIds([]);
    setColorFilter('');
    setSizeFilter('');
    setMaterialFilter('');
  };

  const filteredItems = items.filter((item) => {
    const searchMatches =
      !debouncedSearch ||
      [
        item.name,
        item.color,
        item.material,
        item.brandName,
        item.categoryName,
        ...item.tagNames,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(debouncedSearch));

    const categoryMatches = !selectedCategoryId || item.category_id === selectedCategoryId;
    const brandMatches = !selectedBrandId || item.brand_id === selectedBrandId;
    const colorMatches =
      !colorFilter.trim() || (item.color ?? '').toLowerCase().includes(colorFilter.trim().toLowerCase());
    const sizeMatches =
      !sizeFilter.trim() || (item.size ?? '').toLowerCase().includes(sizeFilter.trim().toLowerCase());
    const materialMatches =
      !materialFilter.trim() ||
      (item.material ?? '').toLowerCase().includes(materialFilter.trim().toLowerCase());
    const tagsMatch =
      selectedTagIds.length === 0 || selectedTagIds.every((tagId) => item.tagIds.includes(tagId));
    const favoriteMatches = !favoriteOnly || favoriteItemIds.includes(item.id);

    return (
      searchMatches &&
      categoryMatches &&
      brandMatches &&
      colorMatches &&
      sizeMatches &&
      materialMatches &&
      tagsMatch &&
      favoriteMatches
    );
  });

  const hasActiveFilters =
    !!debouncedSearch ||
    !!selectedCategoryId ||
    !!selectedBrandId ||
    favoriteOnly ||
    selectedTagIds.length > 0 ||
    !!colorFilter.trim() ||
    !!sizeFilter.trim() ||
    !!materialFilter.trim();

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading your wardrobe...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleToggleFavorite = async (itemId: string) => {
    if (!user) {
      return;
    }

    try {
      const nextProfile = await toggleFavoriteItem(user.id, itemId);
      setFavoriteItemIds(nextProfile.favoriteItemIds);
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update favorites right now.';
      setErrorMessage(message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AmbientBackground />
      <FlatList
        key={viewMode}
        contentContainerStyle={styles.listContent}
        data={filteredItems}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === 'catalog' ? 2 : 1}
        columnWrapperStyle={viewMode === 'catalog' ? styles.catalogRow : undefined}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              loadItems('refresh');
            }}
            refreshing={refreshing}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/items/${item.id}`)}
            style={[styles.card, viewMode === 'catalog' ? styles.catalogCard : styles.listCard]}
          >
            <Pressable onPress={() => handleToggleFavorite(item.id)} style={styles.favoriteButton}>
              <Text style={styles.favoriteButtonText}>
                {favoriteItemIds.includes(item.id) ? '♥' : '♡'}
              </Text>
            </Pressable>
            <View style={viewMode === 'catalog' ? styles.catalogMedia : styles.listMedia}>
              {item.imageUrl ? (
                <Image
                  resizeMode="contain"
                  source={{ uri: item.imageUrl }}
                  style={viewMode === 'catalog' ? styles.itemImage : styles.listImage}
                />
              ) : (
                <View style={viewMode === 'catalog' ? styles.imageFallback : styles.listImageFallback}>
                  <Text style={styles.imageFallbackText}>No image</Text>
                </View>
              )}
            </View>
            <View style={[styles.cardContent, viewMode === 'list' && styles.listCardContent]}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {item.color?.trim() ? item.color : 'Color not set'}
              </Text>
              {item.categoryName ? <Text style={styles.detailText}>{item.categoryName}</Text> : null}
              {item.brandName ? <Text style={styles.detailText}>{item.brandName}</Text> : null}
              {item.size ? <Text style={styles.detailText}>Size {item.size}</Text> : null}
            </View>
          </Pressable>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Wardrobe</Text>
            <Text style={styles.body}>
              Search and filter your wardrobe without losing sight of the details that matter.
            </Text>
            <View style={styles.heroCard}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>Build your wardrobe</Text>
                <Text style={styles.heroBody}>Add pieces, plan events, and jump back into Style AI.</Text>
              </View>
              <View style={styles.heroActions}>
                <Pressable onPress={() => router.push('/(tabs)/add-item')} style={styles.heroSecondaryButton}>
                  <Text style={styles.heroSecondaryButtonText}>Add item</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/events/new')} style={styles.heroPrimaryButton}>
                  <Text style={styles.heroPrimaryButtonText}>Plan event</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/style-ai')} style={styles.heroSecondaryButton}>
                  <Text style={styles.heroSecondaryButtonText}>Style AI</Text>
                </Pressable>
              </View>
            </View>
            {todaySuggestion ? (
              <Pressable
                onPress={() => router.push(`/outfits/${todaySuggestion.outfit.id}`)}
                style={styles.smartCard}
              >
                <View style={styles.smartHeader}>
                  <View style={styles.smartHeaderCopy}>
                    <Text style={styles.smartEyebrow}>What should I wear today</Text>
                    <Text style={styles.smartTitle}>{todaySuggestion.outfit.name}</Text>
                  </View>
                  <View style={styles.smartScorePill}>
                    <Text style={styles.smartScoreText}>{todaySuggestion.scorePercent}%</Text>
                  </View>
                </View>
                <Text style={styles.smartBody}>
                  {todayContext ?? 'A grounded pick based on your events, preferences, and recent rotation.'}
                </Text>
                {todaySuggestion.reasons.slice(0, 2).map((reason) => (
                  <Text key={`${todaySuggestion.outfit.id}-${reason}`} style={styles.smartReason}>
                    {reason}
                  </Text>
                ))}
                <View style={styles.smartActionRow}>
                  <Text style={styles.smartActionText}>Open look</Text>
                  <Pressable onPress={() => router.push('/(tabs)/recommendations')} style={styles.smartSecondaryAction}>
                    <Text style={styles.smartSecondaryActionText}>More suggestions</Text>
                  </Pressable>
                </View>
              </Pressable>
            ) : null}
            <View style={styles.viewToggleRow}>
              <Text style={styles.filterLabel}>View</Text>
              <View style={styles.viewToggle}>
                <Pressable
                  onPress={() => setViewMode('catalog')}
                  style={[
                    styles.viewToggleButton,
                    viewMode === 'catalog' && styles.viewToggleButtonActive,
                  ]}
                >
                  <Ionicons
                    color={viewMode === 'catalog' ? colors.accentText : colors.textMuted}
                    name="grid-outline"
                    size={16}
                  />
                  <Text
                    style={[
                      styles.viewToggleText,
                      viewMode === 'catalog' && styles.viewToggleTextActive,
                    ]}
                  >
                    Catalog
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setViewMode('list')}
                  style={[
                    styles.viewToggleButton,
                    viewMode === 'list' && styles.viewToggleButtonActive,
                  ]}
                >
                  <Ionicons
                    color={viewMode === 'list' ? colors.accentText : colors.textMuted}
                    name="list-outline"
                    size={16}
                  />
                  <Text
                    style={[
                      styles.viewToggleText,
                      viewMode === 'list' && styles.viewToggleTextActive,
                    ]}
                  >
                    List
                  </Text>
                </Pressable>
              </View>
            </View>
            <TextInput
              autoCapitalize="none"
              onChangeText={setSearchText}
              placeholder="Search by item, color, brand, material..."
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              value={searchText}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
            >
              <View style={styles.filterRow}>
                <Pressable
                  onPress={() => setFavoriteOnly((current) => !current)}
                  style={[styles.filterChip, favoriteOnly && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, favoriteOnly && styles.filterChipTextActive]}>
                    Favorites
                  </Text>
                </Pressable>
                <View>
                  <Text style={styles.filterLabel}>Filter</Text>
                </View>
                <Pressable
                  onPress={() => setSelectedCategoryId(null)}
                  style={[
                    styles.filterChip,
                    !selectedCategoryId && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      !selectedCategoryId && styles.filterChipTextActive,
                    ]}
                  >
                    All
                  </Text>
                </Pressable>
                {categories.map((category) => (
                  <Pressable
                    key={category.id}
                    onPress={() => setSelectedCategoryId(category.id)}
                    style={[
                      styles.filterChip,
                      selectedCategoryId === category.id && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedCategoryId === category.id && styles.filterChipTextActive,
                      ]}
                    >
                      {category.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
            >
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Brand</Text>
                <Pressable
                  onPress={() => setSelectedBrandId(null)}
                  style={[styles.filterChip, !selectedBrandId && styles.filterChipActive]}
                >
                  <Text
                    style={[styles.filterChipText, !selectedBrandId && styles.filterChipTextActive]}
                  >
                    All
                  </Text>
                </Pressable>
                {brands.map((brand) => (
                  <Pressable
                    key={brand.id}
                    onPress={() => setSelectedBrandId(brand.id)}
                    style={[
                      styles.filterChip,
                      selectedBrandId === brand.id && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedBrandId === brand.id && styles.filterChipTextActive,
                      ]}
                    >
                      {brand.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Pressable
              onPress={() => setShowAdvancedFilters((current) => !current)}
              style={styles.advancedToggle}
            >
              <Text style={styles.advancedToggleText}>
                {showAdvancedFilters ? 'Hide advanced filters' : 'Show advanced filters'}
              </Text>
            </Pressable>
            {showAdvancedFilters ? (
              <View style={styles.advancedFilters}>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setColorFilter}
                  placeholder="Filter by color"
                  placeholderTextColor={colors.placeholder}
                  style={styles.filterInput}
                  value={colorFilter}
                />
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setSizeFilter}
                  placeholder="Filter by size"
                  placeholderTextColor={colors.placeholder}
                  style={styles.filterInput}
                  value={sizeFilter}
                />
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setMaterialFilter}
                  placeholder="Filter by material"
                  placeholderTextColor={colors.placeholder}
                  style={styles.filterInput}
                  value={materialFilter}
                />
                <View style={styles.tagFilterWrap}>
                  {tags.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id);
                    return (
                      <Pressable
                        key={tag.id}
                        onPress={() => toggleTagFilter(tag.id)}
                        style={[styles.filterChip, selected && styles.filterChipActive]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            selected && styles.filterChipTextActive,
                          ]}
                        >
                          {tag.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {hasActiveFilters ? (
              <View style={styles.activeFilters}>
                <Text style={styles.filterLabel}>Active</Text>
                {debouncedSearch ? <Text style={styles.activeFilterText}>Search: {searchText}</Text> : null}
                {selectedCategoryId ? (
                  <Text style={styles.activeFilterText}>
                    Category: {categories.find((category) => category.id === selectedCategoryId)?.name}
                  </Text>
                ) : null}
                {selectedBrandId ? (
                  <Text style={styles.activeFilterText}>
                    Brand: {brands.find((brand) => brand.id === selectedBrandId)?.name}
                  </Text>
                ) : null}
                {favoriteOnly ? <Text style={styles.activeFilterText}>Favorites only</Text> : null}
                {colorFilter.trim() ? (
                  <Text style={styles.activeFilterText}>Color: {colorFilter.trim()}</Text>
                ) : null}
                {sizeFilter.trim() ? (
                  <Text style={styles.activeFilterText}>Size: {sizeFilter.trim()}</Text>
                ) : null}
                {materialFilter.trim() ? (
                  <Text style={styles.activeFilterText}>Material: {materialFilter.trim()}</Text>
                ) : null}
                {selectedTagIds.map((tagId) => (
                  <Text key={tagId} style={styles.activeFilterText}>
                    Tag: {tags.find((tag) => tag.id === tagId)?.name}
                  </Text>
                ))}
                <Pressable onPress={clearAllFilters} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>Clear all</Text>
                </Pressable>
              </View>
            ) : null}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{hasActiveFilters ? 'No matches found' : 'No items yet'}</Text>
            <Text style={styles.emptyBody}>
              {hasActiveFilters
                ? 'Try changing your search or clearing one of the active filters.'
                : 'Add your first piece from the Add Item tab and it will show up here.'}
            </Text>
            {hasActiveFilters ? (
              <Pressable onPress={clearAllFilters} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Clear filters</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push('/(tabs)/add-item')} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Add your first item</Text>
              </Pressable>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 1180,
    padding: 24,
    paddingBottom: 40,
    flexGrow: 1,
    gap: 12,
  },
  catalogRow: {
    gap: 12,
    justifyContent: 'space-between',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  header: {
    marginBottom: 18,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
    gap: 16,
  },
  heroCopy: {
    gap: 6,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  heroBody: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  smartCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 14,
    padding: 18,
    gap: 10,
  },
  smartHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  smartHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  smartEyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  smartTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  smartScorePill: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smartScoreText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  smartBody: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  smartReason: {
    color: colors.textSubtle,
    lineHeight: 20,
  },
  smartActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  smartActionText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  smartSecondaryAction: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smartSecondaryActionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  heroPrimaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  heroPrimaryButtonText: {
    color: colors.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
  heroSecondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  heroSecondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  searchInput: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filterScroll: {
    marginTop: 16,
  },
  viewToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  viewToggle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  viewToggleButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  viewToggleButtonActive: {
    backgroundColor: colors.accent,
  },
  viewToggleText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  viewToggleTextActive: {
    color: colors.accentText,
  },
  filterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  filterLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.accentText,
  },
  advancedToggle: {
    marginTop: 16,
  },
  advancedToggleText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  advancedFilters: {
    gap: 12,
    marginTop: 14,
  },
  filterInput: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tagFilterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  activeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  activeFilterText: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 999,
    color: colors.textMuted,
    fontSize: 13,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: colors.text,
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: colors.accentText,
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  catalogCard: {
    flex: 1,
    minWidth: 0,
  },
  listCard: {
    flexDirection: 'row',
    minHeight: 156,
  },
  favoriteButton: {
    position: 'absolute',
    right: 14,
    top: 14,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  favoriteButtonText: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  cardContent: {
    paddingBottom: 18,
  },
  listCardContent: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 18,
  },
  catalogMedia: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 16,
    width: '100%',
  },
  listMedia: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 12,
    width: 156,
  },
  itemImage: {
    height: '100%',
    width: '100%',
  },
  listImage: {
    borderRadius: 14,
    height: '100%',
    minHeight: 132,
    width: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  listImageFallback: {
    alignItems: 'center',
    borderRadius: 14,
    height: '100%',
    justifyContent: 'center',
    minHeight: 132,
    width: '100%',
  },
  imageFallbackText: {
    color: colors.textSubtle,
    fontSize: 14,
    fontWeight: '600',
  },
  itemName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  itemMeta: {
    color: colors.textMuted,
    fontSize: 15,
    paddingHorizontal: 18,
  },
  detailText: {
    color: colors.accent,
    fontSize: 14,
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 280,
    paddingTop: 10,
    textAlign: 'center',
  },
  emptyButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 14,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyButtonText: {
    color: colors.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
});
