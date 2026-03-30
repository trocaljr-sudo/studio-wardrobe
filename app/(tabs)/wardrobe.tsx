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
  View,
} from 'react-native';

import { useSession } from '../../lib/session';
import { type Category, type ClothingItem, fetchCategories, fetchWardrobeItems } from '../../lib/wardrobe';

export default function WardrobeScreen() {
  const { user } = useSession();
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadCategories = async () => {
      try {
        const nextCategories = await fetchCategories();
        if (mounted) {
          setCategories(nextCategories);
        }
      } catch {
        if (mounted) {
          setCategories([]);
        }
      }
    };

    loadCategories();

    return () => {
      mounted = false;
    };
  }, []);

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
        const { items: nextItems } = await fetchWardrobeItems(user.id, selectedCategoryId);
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
    [selectedCategoryId, user]
  );

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  useEffect(() => {
    if (loading) {
      return;
    }

    loadItems();
  }, [loadItems, loading]);

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
        data={items}
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
            </View>
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Wardrobe</Text>
            <Text style={styles.body}>
              Browse your items by category and see the key metadata at a glance.
            </Text>
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
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptyBody}>
              {selectedCategoryId
                ? 'No items match this category yet.'
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
