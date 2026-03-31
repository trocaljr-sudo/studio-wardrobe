import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
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
  type Tag,
  fetchBrands,
  fetchCategories,
  fetchTags,
  fetchWardrobeItems,
} from '../../lib/wardrobe';

export default function WardrobeScreen() {
  const { user } = useSession();
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
        const { items: nextItems } = await fetchWardrobeItems(user.id);
        setItems(nextItems);
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

    return (
      searchMatches &&
      categoryMatches &&
      brandMatches &&
      colorMatches &&
      sizeMatches &&
      materialMatches &&
      tagsMatch
    );
  });

  const hasActiveFilters =
    !!debouncedSearch ||
    !!selectedCategoryId ||
    !!selectedBrandId ||
    selectedTagIds.length > 0 ||
    !!colorFilter.trim() ||
    !!sizeFilter.trim() ||
    !!materialFilter.trim();

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.loadingText}>Loading your wardrobe...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={filteredItems}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              loadItems('refresh');
            }}
            refreshing={refreshing}
            tintColor="#8C5E3C"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
            ) : (
              <View style={styles.imageFallback}>
                <Text style={styles.imageFallbackText}>No image</Text>
              </View>
            )}
            <View style={styles.cardContent}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {item.color?.trim() ? item.color : 'Color not set'}
              </Text>
              {item.categoryName ? <Text style={styles.detailText}>{item.categoryName}</Text> : null}
              {item.brandName ? <Text style={styles.detailText}>{item.brandName}</Text> : null}
              {item.size ? <Text style={styles.detailText}>Size {item.size}</Text> : null}
            </View>
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Wardrobe</Text>
            <Text style={styles.body}>
              Search and filter your wardrobe without losing sight of the details that matter.
            </Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setSearchText}
              placeholder="Search by item, color, brand, material..."
              placeholderTextColor="#8B8B95"
              style={styles.searchInput}
              value={searchText}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
            >
              <View style={styles.filterRow}>
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
                  placeholderTextColor="#8B8B95"
                  style={styles.filterInput}
                  value={colorFilter}
                />
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setSizeFilter}
                  placeholder="Filter by size"
                  placeholderTextColor="#8B8B95"
                  style={styles.filterInput}
                  value={sizeFilter}
                />
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setMaterialFilter}
                  placeholder="Filter by material"
                  placeholderTextColor="#8B8B95"
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
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F1EA',
  },
  listContent: {
    padding: 24,
    paddingBottom: 40,
    flexGrow: 1,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#5D534C',
    fontSize: 15,
  },
  header: {
    marginBottom: 18,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7D8CA',
    borderRadius: 16,
    borderWidth: 1,
    color: '#201A17',
    fontSize: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filterScroll: {
    marginTop: 16,
  },
  filterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  filterLabel: {
    color: '#6B615A',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  filterChip: {
    backgroundColor: '#FFFDF9',
    borderColor: '#E7D8CA',
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: '#201A17',
    borderColor: '#201A17',
  },
  filterChipText: {
    color: '#6B615A',
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#F7F1EB',
  },
  advancedToggle: {
    marginTop: 16,
  },
  advancedToggleText: {
    color: '#8C5E3C',
    fontSize: 14,
    fontWeight: '700',
  },
  advancedFilters: {
    gap: 12,
    marginTop: 14,
  },
  filterInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7D8CA',
    borderRadius: 16,
    borderWidth: 1,
    color: '#201A17',
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
    backgroundColor: '#EFE6DE',
    borderRadius: 999,
    color: '#6B615A',
    fontSize: 13,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: '#201A17',
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: '#F7F1EB',
    fontSize: 13,
    fontWeight: '700',
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
  },
  error: {
    color: '#A13737',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7D8CA',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardContent: {
    paddingBottom: 18,
  },
  itemImage: {
    backgroundColor: '#EFE6DE',
    height: 180,
    width: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    backgroundColor: '#EFE6DE',
    height: 180,
    justifyContent: 'center',
    width: '100%',
  },
  imageFallbackText: {
    color: '#8E837A',
    fontSize: 14,
    fontWeight: '600',
  },
  itemName: {
    color: '#201A17',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  itemMeta: {
    color: '#6B615A',
    fontSize: 15,
    paddingHorizontal: 18,
  },
  detailText: {
    color: '#8C5E3C',
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
    color: '#201A17',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptyBody: {
    color: '#5D534C',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 280,
    paddingTop: 10,
    textAlign: 'center',
  },
});
