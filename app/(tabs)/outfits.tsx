import { useFocusEffect, router } from 'expo-router';
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

import { fetchOccasions, fetchOutfits, type Occasion, type OutfitSummary } from '../../lib/outfits';
import { fetchPersonalizationSnapshot, toggleFavoriteOutfit } from '../../lib/personalization';
import { fetchRecommendations } from '../../lib/recommendations';
import { useSession } from '../../lib/session';
import { fetchTags, type Tag } from '../../lib/wardrobe';

export default function OutfitsScreen() {
  const { user } = useSession();
  const [outfits, setOutfits] = useState<OutfitSummary[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [favoriteOutfitIds, setFavoriteOutfitIds] = useState<string[]>([]);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [recentlyLikedOnly, setRecentlyLikedOnly] = useState(false);
  const [goToOnly, setGoToOnly] = useState(false);
  const [recentlyLikedOutfitIds, setRecentlyLikedOutfitIds] = useState<string[]>([]);
  const [goToOutfitIds, setGoToOutfitIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadMetadata = async () => {
      try {
        const [nextOccasions, nextTags] = await Promise.all([fetchOccasions(), fetchTags()]);
        if (!mounted) {
          return;
        }

        setOccasions(nextOccasions);
        setTags(nextTags);
      } catch {
        if (!mounted) {
          return;
        }

        setOccasions([]);
        setTags([]);
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

  const loadOutfits = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!user) {
        setOutfits([]);
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
        const [nextOutfits, personalization, recommendationState] = await Promise.all([
          fetchOutfits(user.id),
          fetchPersonalizationSnapshot(user.id),
          fetchRecommendations(user.id),
        ]);
        setOutfits(nextOutfits);
        setFavoriteOutfitIds(personalization.favoriteOutfitIds);
        setRecentlyLikedOutfitIds(recommendationState.styleProfile.recentlyLikedOutfitIds);
        setGoToOutfitIds(recommendationState.styleProfile.goToOutfitIds);
        setErrorMessage(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load outfits right now.';
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
      loadOutfits();
    }, [loadOutfits])
  );

  const clearFilters = () => {
    setSearchText('');
    setDebouncedSearch('');
    setSelectedOccasionId(null);
    setSelectedTagId(null);
  };

  const filteredOutfits = outfits.filter((outfit) => {
    const searchMatches =
      !debouncedSearch ||
      [outfit.name, outfit.description, ...outfit.occasions.map((occasion) => occasion.name), ...outfit.tags.map((tag) => tag.name)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(debouncedSearch));

    const occasionMatches =
      !selectedOccasionId || outfit.occasions.some((occasion) => occasion.id === selectedOccasionId);
    const tagMatches = !selectedTagId || outfit.tags.some((tag) => tag.id === selectedTagId);
    const favoriteMatches = !favoriteOnly || favoriteOutfitIds.includes(outfit.id);
    const likedMatches = !recentlyLikedOnly || recentlyLikedOutfitIds.includes(outfit.id);
    const goToMatches = !goToOnly || goToOutfitIds.includes(outfit.id);

    return searchMatches && occasionMatches && tagMatches && favoriteMatches && likedMatches && goToMatches;
  });

  const hasActiveFilters =
    !!debouncedSearch || !!selectedOccasionId || !!selectedTagId || favoriteOnly || recentlyLikedOnly || goToOnly;

  const handleToggleFavorite = async (outfitId: string) => {
    if (!user) {
      return;
    }

    try {
      const nextProfile = await toggleFavoriteOutfit(user.id, outfitId);
      setFavoriteOutfitIds(nextProfile.favoriteOutfitIds);
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update favorites right now.';
      setErrorMessage(message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.helperText}>Loading outfits...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={filteredOutfits}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              loadOutfits('refresh');
            }}
            refreshing={refreshing}
            tintColor="#8C5E3C"
          />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/outfits/${item.id}`)} style={styles.card}>
            <Pressable onPress={() => handleToggleFavorite(item.id)} style={styles.favoriteButton}>
              <Text style={styles.favoriteButtonText}>
                {favoriteOutfitIds.includes(item.id) ? '♥' : '♡'}
              </Text>
            </Pressable>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.image} />
            ) : (
              <View style={styles.imageFallback}>
                <Text style={styles.imageFallbackText}>No preview</Text>
              </View>
            )}
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>{item.itemCount} items</Text>
              {item.occasions.length > 0 ? (
                <Text style={styles.cardDetail}>{item.occasions.map((occasion) => occasion.name).join(', ')}</Text>
              ) : null}
              {item.tags.length > 0 ? (
                <Text style={styles.cardDetail}>Tags: {item.tags.map((tag) => tag.name).join(', ')}</Text>
              ) : null}
            </View>
          </Pressable>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Outfits</Text>
            <Text style={styles.body}>
              Save looks built from your wardrobe items and tag them for real-world use.
            </Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setSearchText}
              placeholder="Search outfits, occasions, or tags..."
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
                <Pressable
                  onPress={() => setFavoriteOnly((current) => !current)}
                  style={[styles.filterChip, favoriteOnly && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, favoriteOnly && styles.filterChipTextActive]}>
                    Favorites
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setRecentlyLikedOnly((current) => !current)}
                  style={[styles.filterChip, recentlyLikedOnly && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, recentlyLikedOnly && styles.filterChipTextActive]}>
                    Recently liked
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setGoToOnly((current) => !current)}
                  style={[styles.filterChip, goToOnly && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, goToOnly && styles.filterChipTextActive]}>
                    Go-to outfits
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
            >
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Occasion</Text>
                <Pressable
                  onPress={() => setSelectedOccasionId(null)}
                  style={[styles.filterChip, !selectedOccasionId && styles.filterChipActive]}
                >
                  <Text
                    style={[styles.filterChipText, !selectedOccasionId && styles.filterChipTextActive]}
                  >
                    All
                  </Text>
                </Pressable>
                {occasions.map((occasion) => (
                  <Pressable
                    key={occasion.id}
                    onPress={() => setSelectedOccasionId(occasion.id)}
                    style={[
                      styles.filterChip,
                      selectedOccasionId === occasion.id && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedOccasionId === occasion.id && styles.filterChipTextActive,
                      ]}
                    >
                      {occasion.name}
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
                <Text style={styles.filterLabel}>Tag</Text>
                <Pressable
                  onPress={() => setSelectedTagId(null)}
                  style={[styles.filterChip, !selectedTagId && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, !selectedTagId && styles.filterChipTextActive]}>
                    All
                  </Text>
                </Pressable>
                {tags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    onPress={() => setSelectedTagId(tag.id)}
                    style={[styles.filterChip, selectedTagId === tag.id && styles.filterChipActive]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedTagId === tag.id && styles.filterChipTextActive,
                      ]}
                    >
                      {tag.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {hasActiveFilters ? (
              <View style={styles.activeFilters}>
                {debouncedSearch ? <Text style={styles.activeFilterText}>Search: {searchText}</Text> : null}
                {selectedOccasionId ? (
                  <Text style={styles.activeFilterText}>
                    Occasion: {occasions.find((occasion) => occasion.id === selectedOccasionId)?.name}
                  </Text>
                ) : null}
                {favoriteOnly ? <Text style={styles.activeFilterText}>Favorites only</Text> : null}
                {recentlyLikedOnly ? <Text style={styles.activeFilterText}>Recently liked</Text> : null}
                {goToOnly ? <Text style={styles.activeFilterText}>Go-to outfits</Text> : null}
                {selectedTagId ? (
                  <Text style={styles.activeFilterText}>
                    Tag: {tags.find((tag) => tag.id === selectedTagId)?.name}
                  </Text>
                ) : null}
                <Pressable onPress={clearFilters} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>Clear all</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable onPress={() => router.push('/outfits/new')} style={styles.createButton}>
              <Text style={styles.createButtonText}>Create outfit</Text>
            </Pressable>
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{hasActiveFilters ? 'No outfits match' : 'No outfits yet'}</Text>
            <Text style={styles.emptyBody}>
              {hasActiveFilters
                ? 'Try changing your search or clearing the current filters.'
                : 'Create your first outfit to start saving complete looks.'}
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
  helperText: {
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
  createButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#201A17',
    borderRadius: 16,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  createButtonText: {
    color: '#F7F1EB',
    fontSize: 15,
    fontWeight: '700',
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
    position: 'relative',
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
    backgroundColor: '#FFF7EF',
  },
  favoriteButtonText: {
    color: '#9C3E4E',
    fontSize: 18,
    fontWeight: '700',
  },
  image: {
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
  cardContent: {
    padding: 18,
  },
  cardTitle: {
    color: '#201A17',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardMeta: {
    color: '#6B615A',
    fontSize: 15,
  },
  cardDetail: {
    color: '#8C5E3C',
    fontSize: 14,
    marginTop: 6,
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
    textAlign: 'center',
  },
});
