import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  fetchEventRecommendations,
  fetchRecommendations,
  type BuiltLookSuggestion,
  type RecommendationMode,
  type RecommendedItem,
  type RecommendedOutfit,
} from '../../lib/recommendations';
import { useSession } from '../../lib/session';

type ScreenState = Awaited<ReturnType<typeof fetchRecommendations>>;

const MODES: { id: RecommendationMode; label: string }[] = [
  { id: 'best-match', label: 'Best match' },
  { id: 'event-based', label: 'Event-based' },
  { id: 'unworn-pieces', label: 'Unused pieces' },
  { id: 'build-from-items', label: 'Build from items' },
];

export default function RecommendationsScreen() {
  const { user } = useSession();
  const [state, setState] = useState<ScreenState | null>(null);
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [eventRecommendations, setEventRecommendations] = useState<RecommendedOutfit[]>([]);
  const [mode, setMode] = useState<RecommendationMode>('best-match');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRecommendations = useCallback(
    async (nextOccasionId: string | null, modeType: 'initial' | 'refresh' = 'initial') => {
      if (!user) {
        setState(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (modeType === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const nextState = await fetchRecommendations(user.id, nextOccasionId);
        setState(nextState);
        setSelectedEventId((current) =>
          current && nextState.upcomingEvents.some((event) => event.id === current)
            ? current
            : nextState.upcomingEvents[0]?.id ?? null
        );
        setErrorMessage(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load recommendations right now.';
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
      loadRecommendations(selectedOccasionId);
    }, [loadRecommendations, selectedOccasionId])
  );

  useEffect(() => {
    let mounted = true;

    const loadEventRecommendations = async () => {
      if (!user || !selectedEventId) {
        if (mounted) {
          setEventRecommendations([]);
        }
        return;
      }

      try {
        const { recommendations } = await fetchEventRecommendations(user.id, selectedEventId);

        if (mounted) {
          setEventRecommendations(recommendations);
        }
      } catch {
        if (mounted) {
          setEventRecommendations([]);
        }
      }
    };

    loadEventRecommendations();

    return () => {
      mounted = false;
    };
  }, [selectedEventId, user]);

  const activeEvent = state?.upcomingEvents.find((event) => event.id === selectedEventId) ?? null;

  const renderOutfitCard = (recommendation: RecommendedOutfit) => (
    <Pressable
      key={recommendation.outfit.id}
      onPress={() => router.push(`/outfits/${recommendation.outfit.id}`)}
      style={styles.card}
    >
      {recommendation.outfit.imageUrl ? (
        <Image source={{ uri: recommendation.outfit.imageUrl }} style={styles.cardImage} />
      ) : (
        <View style={styles.cardPlaceholder}>
          <Text style={styles.cardPlaceholderText}>No preview</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{recommendation.outfit.name}</Text>
        <Text style={styles.cardMeta}>{recommendation.itemCount} items</Text>
        {recommendation.reasons.map((reason) => (
          <Text key={`${recommendation.outfit.id}-${reason}`} style={styles.reasonText}>
            {reason}
          </Text>
        ))}
      </View>
    </Pressable>
  );

  const renderItemCard = (entry: RecommendedItem) => (
    <View key={entry.item.id} style={styles.card}>
      {entry.item.imageUrl ? (
        <Image source={{ uri: entry.item.imageUrl }} style={styles.cardImage} />
      ) : (
        <View style={styles.cardPlaceholder}>
          <Text style={styles.cardPlaceholderText}>No image</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{entry.item.name}</Text>
        <Text style={styles.cardMeta}>
          {[entry.item.categoryName, entry.item.color].filter(Boolean).join(' · ') || 'Wardrobe item'}
        </Text>
        {entry.reasons.map((reason) => (
          <Text key={`${entry.item.id}-${reason}`} style={styles.reasonText}>
            {reason}
          </Text>
        ))}
      </View>
    </View>
  );

  const renderBuiltLook = (suggestion: BuiltLookSuggestion) => (
    <View key={suggestion.id} style={styles.lookCard}>
      <Text style={styles.lookTitle}>{suggestion.title}</Text>
      <View style={styles.lookItems}>
        {suggestion.items.map((item) => (
          <View key={item.id} style={styles.lookItemPill}>
            <Text style={styles.lookItemText}>{item.name}</Text>
          </View>
        ))}
      </View>
      {suggestion.reasons.map((reason) => (
        <Text key={`${suggestion.id}-${reason}`} style={styles.reasonText}>
          {reason}
        </Text>
      ))}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.helperText}>Loading recommendations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const occasionName =
    state?.occasions.find((occasion) => occasion.id === selectedOccasionId)?.name ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            onRefresh={() => loadRecommendations(selectedOccasionId, 'refresh')}
            refreshing={refreshing}
            tintColor="#8C5E3C"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Recommendations</Text>
          <Text style={styles.body}>
            Rule-based styling picks that stay grounded in your saved outfits, events, and unused wardrobe pieces.
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
          <View style={styles.chipRow}>
            {MODES.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => setMode(entry.id)}
                style={[styles.chip, mode === entry.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, mode === entry.id && styles.chipTextActive]}>
                  {entry.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setSelectedOccasionId(null)}
              style={[styles.chip, !selectedOccasionId && styles.chipActive]}
            >
              <Text style={[styles.chipText, !selectedOccasionId && styles.chipTextActive]}>All occasions</Text>
            </Pressable>
            {state?.occasions.map((occasion) => (
              <Pressable
                key={occasion.id}
                onPress={() => setSelectedOccasionId(occasion.id)}
                style={[styles.chip, selectedOccasionId === occasion.id && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, selectedOccasionId === occasion.id && styles.chipTextActive]}
                >
                  {occasion.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        {mode === 'best-match' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {occasionName ? `${occasionName} outfit matches` : 'Best outfit matches'}
            </Text>
            <Text style={styles.sectionBody}>
              Ranked by occasion match, event coverage, completeness, and whether the look has already been heavily planned.
            </Text>
            {state?.recommendedOutfits.slice(0, 5).map(renderOutfitCard)}
          </View>
        ) : null}

        {mode === 'event-based' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Event-based suggestions</Text>
            {activeEvent ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
                  <View style={styles.chipRow}>
                    {state?.upcomingEvents.map((event) => (
                      <Pressable
                        key={event.id}
                        onPress={() => setSelectedEventId(event.id)}
                        style={[styles.chip, selectedEventId === event.id && styles.chipActive]}
                      >
                        <Text
                          style={[styles.chipText, selectedEventId === event.id && styles.chipTextActive]}
                        >
                          {event.title}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.sectionBody}>
                  Built around {activeEvent.title}
                  {activeEvent.occasion ? ` and its ${activeEvent.occasion.name} occasion` : ''}.
                </Text>
                {eventRecommendations.length > 0 ? (
                  eventRecommendations.map(renderOutfitCard)
                ) : (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>No strong event match yet</Text>
                    <Text style={styles.emptyBody}>
                      Try tagging more outfits with occasions, or build a new look from the items below.
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={() => router.push(`/events/${activeEvent.id}`)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Open event</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No upcoming events yet</Text>
                <Text style={styles.emptyBody}>
                  Add an event to get occasion-aware outfit suggestions in context.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {mode === 'unworn-pieces' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unused pieces to build around</Text>
            <Text style={styles.sectionBody}>
              These items have not been used in any saved outfit yet, so they are good candidates for something fresh.
            </Text>
            {state?.unusedItems.length ? (
              state.unusedItems.map(renderItemCard)
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Everything is already in rotation</Text>
                <Text style={styles.emptyBody}>
                  Your saved outfits already touch every piece in the wardrobe.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {mode === 'build-from-items' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Build from wardrobe</Text>
            <Text style={styles.sectionBody}>
              Starter combinations pulled from your item metadata, neutral colors, and pieces that have not made it into saved outfits yet.
            </Text>
            {state?.builtLooks.length ? (
              state.builtLooks.map(renderBuiltLook)
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Not enough variety yet</Text>
                <Text style={styles.emptyBody}>
                  Add a few more categories like tops, bottoms, or shoes to unlock build-from-items suggestions.
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F1EA',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 18,
  },
  header: {
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#201A17',
  },
  body: {
    color: '#5E534A',
    lineHeight: 22,
  },
  rowScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFF9F2',
    borderWidth: 1,
    borderColor: '#E0D1C1',
  },
  chipActive: {
    backgroundColor: '#E8D8CA',
    borderColor: '#8C5E3C',
  },
  chipText: {
    color: '#5D524A',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#5A361A',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#201A17',
  },
  sectionBody: {
    color: '#675D55',
    lineHeight: 21,
  },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E7D8CA',
    backgroundColor: '#FFFCF7',
  },
  cardImage: {
    width: '100%',
    height: 170,
    backgroundColor: '#E9DED4',
  },
  cardPlaceholder: {
    width: '100%',
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDE4DB',
  },
  cardPlaceholderText: {
    color: '#7A6E66',
    fontWeight: '600',
  },
  cardBody: {
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#201A17',
  },
  cardMeta: {
    color: '#6A6058',
  },
  reasonText: {
    color: '#4E443C',
    lineHeight: 20,
  },
  lookCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E7D8CA',
    backgroundColor: '#FFFCF7',
    padding: 16,
    gap: 10,
  },
  lookTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#201A17',
  },
  lookItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lookItemPill: {
    backgroundColor: '#F2E7DB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lookItemText: {
    color: '#4E443C',
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFE3D6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  secondaryButtonText: {
    color: '#5A361A',
    fontWeight: '700',
  },
  emptyBox: {
    borderRadius: 20,
    backgroundColor: '#FFF9F2',
    borderWidth: 1,
    borderColor: '#E5D8CA',
    padding: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2C221E',
  },
  emptyBody: {
    color: '#6A6058',
    lineHeight: 21,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  helperText: {
    color: '#6A6058',
  },
  error: {
    color: '#A13D30',
    lineHeight: 20,
  },
});
