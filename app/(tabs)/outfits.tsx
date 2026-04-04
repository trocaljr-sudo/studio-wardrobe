import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchOccasions, fetchOutfits, type Occasion, type OutfitSummary } from '../../lib/outfits';
import { fetchPersonalizationSnapshot, toggleFavoriteOutfit } from '../../lib/personalization';
import { fetchRecommendations } from '../../lib/recommendations';
import { AmbientBackground } from '../../lib/ambient-background';
import { useSession } from '../../lib/session';
import { useTheme } from '../../lib/theme';
import { fetchTags, type Tag } from '../../lib/wardrobe';

export default function OutfitsScreen() {
  const { user } = useSession();
  const { colors } = useTheme();
  const styles = createStyles(colors);
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
  const [hoveredOutfitId, setHoveredOutfitId] = useState<string | null>(null);
  const [hoveredCreate, setHoveredCreate] = useState(false);
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
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.helperText}>Loading outfits...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <AmbientBackground />
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
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onHoverIn={Platform.OS === 'web' ? () => setHoveredOutfitId(item.id) : undefined}
            onHoverOut={Platform.OS === 'web' ? () => setHoveredOutfitId((current) => (current === item.id ? null : current)) : undefined}
            onPress={() => router.push(`/outfits/${item.id}`)}
            style={({ pressed }) => [
              styles.card,
              hoveredOutfitId === item.id && styles.cardHovered,
              pressed && styles.cardPressed,
            ]}
          >
            <Pressable onPress={() => handleToggleFavorite(item.id)} style={styles.favoriteButton}>
              <Text style={styles.favoriteButtonText}>
                {favoriteOutfitIds.includes(item.id) ? '♥' : '♡'}
              </Text>
            </Pressable>
            {item.imageUrl ? (
              <Image resizeMode="contain" source={{ uri: item.imageUrl }} style={styles.image} />
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
            <Pressable
              onHoverIn={Platform.OS === 'web' ? () => setHoveredCreate(true) : undefined}
              onHoverOut={Platform.OS === 'web' ? () => setHoveredCreate(false) : undefined}
              onPress={() => router.push('/outfits/new')}
              style={({ pressed }) => [
                styles.createButton,
                hoveredCreate && styles.primaryButtonHovered,
                pressed && styles.buttonPressed,
              ]}
            >
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
            {hasActiveFilters ? (
              <Pressable onPress={clearFilters} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Clear filters</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push('/outfits/new')} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Create your first outfit</Text>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  header: {
    marginBottom: 18,
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
  createButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 16,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonHovered: {
    backgroundColor: colors.accentMuted,
  },
  buttonPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  createButtonText: {
    color: colors.accentText,
    fontSize: 15,
    fontWeight: '700',
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
  cardHovered: {
    borderColor: colors.accentMuted,
    shadowColor: colors.accent,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.995 }],
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
    backgroundColor: colors.surfaceStrong,
  },
  favoriteButtonText: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  image: {
    height: 180,
    width: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    height: 180,
    justifyContent: 'center',
    width: '100%',
  },
  imageFallbackText: {
    color: colors.textSubtle,
    fontSize: 14,
    fontWeight: '600',
  },
  cardContent: {
    padding: 18,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 15,
  },
  cardDetail: {
    color: colors.accent,
    fontSize: 14,
    marginTop: 6,
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
