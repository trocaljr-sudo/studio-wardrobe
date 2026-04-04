import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackground } from '../../lib/ambient-background';
import { fetchAppSettings } from '../../lib/app-settings';
import { updateEvent } from '../../lib/events';
import { detectLocalWeatherMode } from '../../lib/local-weather';
import { createOutfit } from '../../lib/outfits';
import {
  type ClosetInsight,
  fetchEventRecommendations,
  fetchRecommendations,
  type BuiltLookSuggestion,
  type OutfitMultiplier,
  type RecommendationMode,
  type RecommendedItem,
  type RecommendedOutfit,
  type WeatherMode,
} from '../../lib/recommendations';
import { recordFeedback, toggleFavoriteOutfit } from '../../lib/personalization';
import { useSession } from '../../lib/session';
import { useTheme } from '../../lib/theme';

type ScreenState = Awaited<ReturnType<typeof fetchRecommendations>>;

const MODES: { id: RecommendationMode; label: string }[] = [
  { id: 'best-match', label: 'Best match' },
  { id: 'event-based', label: 'Event-based' },
  { id: 'unworn-pieces', label: 'Unused pieces' },
  { id: 'build-from-items', label: 'Build from items' },
];

const WEATHER_MODES: { id: WeatherMode; label: string }[] = [
  { id: 'any', label: 'Any weather' },
  { id: 'cold', label: 'Cold' },
  { id: 'mild', label: 'Mild' },
  { id: 'warm', label: 'Warm' },
  { id: 'rainy', label: 'Rainy' },
];

export default function RecommendationsScreen() {
  const { user } = useSession();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [state, setState] = useState<ScreenState | null>(null);
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [eventRecommendations, setEventRecommendations] = useState<RecommendedOutfit[]>([]);
  const [mode, setMode] = useState<RecommendationMode>('best-match');
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('any');
  const [weatherSummary, setWeatherSummary] = useState<string | null>(null);
  const [weatherAssistEnabled, setWeatherAssistEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [detectingWeather, setDetectingWeather] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRecommendations = useCallback(
    async (
      nextOccasionId: string | null,
      nextWeatherMode: WeatherMode,
      modeType: 'initial' | 'refresh' = 'initial'
    ) => {
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
        const nextState = await fetchRecommendations(user.id, nextOccasionId, nextWeatherMode);
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
      let active = true;

      void fetchAppSettings()
        .then((settings) => {
          if (active) {
            setWeatherAssistEnabled(settings.weatherAssistEnabled);
          }
        })
        .catch(() => {
          if (active) {
            setWeatherAssistEnabled(true);
          }
        });

      loadRecommendations(selectedOccasionId, weatherMode);

      return () => {
        active = false;
      };
    }, [loadRecommendations, selectedOccasionId, weatherMode])
  );

  useEffect(() => {
    let mounted = true;

    const loadAppSettings = async () => {
      try {
        const settings = await fetchAppSettings();

        if (mounted) {
          setWeatherAssistEnabled(settings.weatherAssistEnabled);
        }
      } catch {
        if (mounted) {
          setWeatherAssistEnabled(true);
        }
      }
    };

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

    loadAppSettings();
    loadEventRecommendations();

    return () => {
      mounted = false;
    };
  }, [selectedEventId, user]);

  const activeEvent = state?.upcomingEvents.find((event) => event.id === selectedEventId) ?? null;

  const handleOutfitFeedback = async (
    recommendation: RecommendedOutfit,
    signal: 'like' | 'dislike',
    source: 'ai' | 'rules'
  ) => {
    if (!user) {
      return;
    }

    try {
      await recordFeedback({
        userId: user.id,
        targetType: 'outfit',
        targetId: recommendation.outfit.id,
        signal,
        source,
      });
      await loadRecommendations(selectedOccasionId, weatherMode);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save that feedback right now.';
      setErrorMessage(message);
    }
  };

  const handleToggleFavorite = async (outfitId: string) => {
    if (!user) {
      return;
    }

    try {
      await toggleFavoriteOutfit(user.id, outfitId);
      await loadRecommendations(selectedOccasionId, weatherMode);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update favorites right now.';
      setErrorMessage(message);
    }
  };

  const createOutfitFromSuggestion = async (suggestion: BuiltLookSuggestion) => {
    if (!user) {
      throw new Error('Sign in again before saving a suggested look.');
    }

    return createOutfit({
      ownerId: user.id,
      name: suggestion.title,
      clothingItems: suggestion.items,
      occasionIds: selectedOccasionId ? [selectedOccasionId] : [],
    });
  };

  const handleSaveBuiltLook = async (suggestion: BuiltLookSuggestion) => {
    setActionLoadingId(`save-${suggestion.id}`);
    setErrorMessage(null);

    try {
      const outfit = await createOutfitFromSuggestion(suggestion);
      await loadRecommendations(selectedOccasionId, weatherMode);
      router.push(`/outfits/${outfit.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save that suggested look right now.';
      setErrorMessage(message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAssignToNextEvent = async (suggestion: BuiltLookSuggestion) => {
    if (!user) {
      return;
    }

    const targetEvent = activeEvent ?? state?.upcomingEvents[0] ?? null;

    if (!targetEvent || !targetEvent.scheduledDate) {
      setErrorMessage('Add an upcoming event first so the app has somewhere to assign this look.');
      return;
    }

    setActionLoadingId(`assign-${suggestion.id}`);
    setErrorMessage(null);

    try {
      const outfit = await createOutfitFromSuggestion(suggestion);
      await updateEvent({
        eventId: targetEvent.id,
        userId: user.id,
        title: targetEvent.title,
        notes: targetEvent.notes ?? '',
        scheduledDate: targetEvent.scheduledDate,
        scheduledTime: targetEvent.scheduledTime ?? '',
        occasionId: targetEvent.occasion?.id ?? null,
        outfitId: outfit.id,
      });
      await loadRecommendations(selectedOccasionId, weatherMode);
      router.push(`/events/${targetEvent.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to assign that look to an event right now.';
      setErrorMessage(message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUseLocalWeather = async () => {
    setDetectingWeather(true);
    setErrorMessage(null);

    try {
      const detection = await detectLocalWeatherMode();
      setWeatherMode(detection.mode);
      setWeatherSummary(
        detection.cached ? `${detection.summary} · cached fallback` : detection.summary
      );
      await loadRecommendations(selectedOccasionId, detection.mode);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to detect local weather right now.';
      setErrorMessage(message);
    } finally {
      setDetectingWeather(false);
    }
  };

  const renderOutfitCard = (recommendation: RecommendedOutfit) => (
    <Pressable
      key={recommendation.outfit.id}
      onPress={() => router.push(`/outfits/${recommendation.outfit.id}`)}
      style={styles.card}
    >
      {recommendation.outfit.imageUrl ? (
        <Image resizeMode="contain" source={{ uri: recommendation.outfit.imageUrl }} style={styles.cardImage} />
      ) : (
        <View style={styles.cardPlaceholder}>
          <Text style={styles.cardPlaceholderText}>No preview</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.scoreRow}>
          <Text style={styles.cardTitle}>{recommendation.outfit.name}</Text>
          <View style={styles.scorePill}>
            <Text style={styles.scorePillText}>{recommendation.scorePercent}%</Text>
          </View>
        </View>
        <Text style={styles.cardMeta}>
          {recommendation.itemCount} items · {recommendation.scoreLabel}
        </Text>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownText}>Match {recommendation.breakdown.matchQuality}</Text>
          <Text style={styles.breakdownText}>Color {recommendation.breakdown.colorHarmony}</Text>
          <Text style={styles.breakdownText}>Balance {recommendation.breakdown.categoryBalance}</Text>
          <Text style={styles.breakdownText}>Style {recommendation.breakdown.styleAlignment}</Text>
        </View>
        {recommendation.reasons.map((reason) => (
          <Text key={`${recommendation.outfit.id}-${reason}`} style={styles.reasonText}>
            {reason}
          </Text>
        ))}
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => handleToggleFavorite(recommendation.outfit.id)}
            style={styles.smallChip}
          >
            <Text style={styles.smallChipText}>
              {recommendation.isFavorite ? '♥ Favorite' : '♡ Favorite'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleOutfitFeedback(recommendation, 'like', 'rules')}
            style={[styles.smallChip, recommendation.feedbackSignal === 'like' && styles.smallChipActive]}
          >
            <Text
              style={[
                styles.smallChipText,
                recommendation.feedbackSignal === 'like' && styles.smallChipTextActive,
              ]}
            >
              👍 Like
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleOutfitFeedback(recommendation, 'dislike', 'rules')}
            style={[styles.smallChip, recommendation.feedbackSignal === 'dislike' && styles.smallChipActive]}
          >
            <Text
              style={[
                styles.smallChipText,
                recommendation.feedbackSignal === 'dislike' && styles.smallChipTextActive,
              ]}
            >
              👎 Dislike
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  const renderItemCard = (entry: RecommendedItem) => (
    <View key={entry.item.id} style={styles.card}>
      {entry.item.imageUrl ? (
        <Image resizeMode="contain" source={{ uri: entry.item.imageUrl }} style={styles.cardImage} />
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
      <View style={styles.scoreRow}>
        <Text style={styles.lookTitle}>{suggestion.title}</Text>
        <View style={styles.scorePill}>
          <Text style={styles.scorePillText}>{suggestion.scoreLabel}</Text>
        </View>
      </View>
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
      <View style={styles.actionRow}>
        <Pressable
          disabled={actionLoadingId !== null}
          onPress={() => handleSaveBuiltLook(suggestion)}
          style={[
            styles.smallChip,
            styles.smallChipActive,
            actionLoadingId !== null && styles.smallChipDisabled,
          ]}
        >
          <Text style={[styles.smallChipText, styles.smallChipTextActive]}>
            {actionLoadingId === `save-${suggestion.id}` ? 'Saving...' : 'Save this look'}
          </Text>
        </Pressable>
        <Pressable
          disabled={actionLoadingId !== null}
          onPress={() =>
            router.push({
              pathname: '/outfits/new',
              params: {
                suggestedItemIds: suggestion.items.map((item) => item.id).join(','),
              },
            })
          }
          style={[styles.smallChip, actionLoadingId !== null && styles.smallChipDisabled]}
        >
          <Text style={styles.smallChipText}>Open in builder</Text>
        </Pressable>
        {(activeEvent ?? state?.upcomingEvents[0]) ? (
          <Pressable
            disabled={actionLoadingId !== null}
            onPress={() => handleAssignToNextEvent(suggestion)}
            style={[styles.smallChip, actionLoadingId !== null && styles.smallChipDisabled]}
          >
            <Text style={styles.smallChipText}>
              {actionLoadingId === `assign-${suggestion.id}`
                ? 'Assigning...'
                : 'Assign to next event'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const renderClosetInsight = (insight: ClosetInsight) => (
    <View key={insight.id} style={styles.insightCard}>
      <Text style={styles.insightTitle}>{insight.title}</Text>
      <Text style={styles.insightBody}>{insight.body}</Text>
    </View>
  );

  const renderMultiplierCard = (entry: OutfitMultiplier) => (
    <View key={entry.item.id} style={styles.multiplierCard}>
      {entry.item.imageUrl ? (
        <Image resizeMode="contain" source={{ uri: entry.item.imageUrl }} style={styles.multiplierImage} />
      ) : (
        <View style={styles.multiplierPlaceholder}>
          <Text style={styles.cardPlaceholderText}>No image</Text>
        </View>
      )}
      <View style={styles.multiplierCopy}>
        <Text style={styles.multiplierTitle}>{entry.item.name}</Text>
        <Text style={styles.multiplierMeta}>{entry.reason}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.helperText}>Loading recommendations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const occasionName =
    state?.occasions.find((occasion) => occasion.id === selectedOccasionId)?.name ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AmbientBackground />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            onRefresh={() => loadRecommendations(selectedOccasionId, weatherMode, 'refresh')}
            refreshing={refreshing}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Recommendations</Text>
          <Text style={styles.body}>
            Rule-based styling picks that stay grounded in your saved outfits, events, and unused wardrobe pieces.
          </Text>
          <Pressable onPress={() => router.push('/style-ai')} style={styles.aiButton}>
            <Text style={styles.aiButtonText}>Open Style AI</Text>
          </Pressable>
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
            {WEATHER_MODES.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => {
                  setWeatherMode(entry.id);
                  setWeatherSummary(null);
                }}
                style={[styles.chip, weatherMode === entry.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, weatherMode === entry.id && styles.chipTextActive]}>
                  {entry.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        {weatherAssistEnabled ? (
          <View style={styles.weatherActionRow}>
            <Pressable
              disabled={detectingWeather}
              onPress={handleUseLocalWeather}
              style={[styles.secondaryButton, detectingWeather && styles.smallChipDisabled]}
            >
              <Text style={styles.secondaryButtonText}>
                {detectingWeather ? 'Checking local weather...' : 'Use local weather'}
              </Text>
            </Pressable>
            {weatherSummary ? <Text style={styles.weatherSummary}>{weatherSummary}</Text> : null}
          </View>
        ) : (
          <Text style={styles.weatherSummary}>
            Local weather assist is off in Settings, so today’s picks stay manual.
          </Text>
        )}

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

        {state?.todaySuggestions.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What should I wear today</Text>
            <Text style={styles.sectionBody}>{state.todayContext}</Text>
            <Text style={styles.helperNote}>
              {weatherMode === 'any'
                ? 'Use the weather chips above to tune today’s outfit mix.'
                : `Currently tuned for ${WEATHER_MODES.find((entry) => entry.id === weatherMode)?.label?.toLowerCase()}.`}
            </Text>
            {state.todaySuggestions.map(renderOutfitCard)}
          </View>
        ) : null}

        {mode === 'best-match' ? (
          <View style={styles.section}>
            {state?.personalizedOutfits.length ? (
              <>
                <Text style={styles.sectionTitle}>Based on your style</Text>
                <Text style={styles.sectionBody}>
                  {state.styleProfile.summaryLines[0] ?? 'These are the looks that best match what you keep favoriting and liking.'}
                </Text>
                {state.personalizedOutfits.map(renderOutfitCard)}
              </>
            ) : null}
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Closet utilization insights</Text>
          <Text style={styles.sectionBody}>
            Quick reads on what you lean on most, what is underused, and where you can get more range out of the closet.
          </Text>
          {state?.closetInsights.length ? (
            state.closetInsights.map(renderClosetInsight)
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Insights will appear as you build more looks</Text>
              <Text style={styles.emptyBody}>
                Save a few outfits and the app will start surfacing your strongest rotation patterns.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Outfit multiplier</Text>
          <Text style={styles.sectionBody}>
            Pieces that stretch across multiple looks are the strongest closet multipliers.
          </Text>
          {state?.outfitMultipliers.length ? (
            state.outfitMultipliers.map(renderMultiplierCard)
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Need more saved outfits first</Text>
              <Text style={styles.emptyBody}>
                Once items appear across multiple looks, they will show up here as multiplier pieces.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 1180,
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
    color: colors.text,
  },
  body: {
    color: colors.textMuted,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.accent,
  },
  aiButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  aiButtonText: {
    color: colors.accent,
    fontWeight: '700',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  sectionBody: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardImage: {
    width: '100%',
    height: 170,
    backgroundColor: colors.surfaceStrong,
  },
  cardPlaceholder: {
    width: '100%',
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
  },
  cardPlaceholderText: {
    color: colors.textSubtle,
    fontWeight: '600',
  },
  cardBody: {
    padding: 16,
    gap: 6,
  },
  scoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  scorePill: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scorePillText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  cardMeta: {
    color: colors.textMuted,
  },
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  breakdownText: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  reasonText: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  lookCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 10,
  },
  lookTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  lookItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lookItemPill: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lookItemText: {
    color: colors.text,
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  secondaryButtonText: {
    color: colors.accent,
    fontWeight: '700',
  },
  weatherActionRow: {
    gap: 10,
  },
  weatherSummary: {
    color: colors.textSubtle,
    lineHeight: 20,
  },
  insightCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 8,
  },
  insightTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  insightBody: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  multiplierCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    overflow: 'hidden',
    padding: 12,
  },
  multiplierImage: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 14,
    height: 88,
    width: 88,
  },
  multiplierPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderRadius: 14,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  multiplierCopy: {
    flex: 1,
    gap: 6,
  },
  multiplierTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  multiplierMeta: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  smallChip: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallChipActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  smallChipText: {
    color: colors.text,
    fontWeight: '700',
  },
  smallChipTextActive: {
    color: colors.accent,
  },
  smallChipDisabled: {
    opacity: 0.55,
  },
  emptyBox: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  emptyBody: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  helperText: {
    color: colors.textMuted,
  },
  helperNote: {
    color: colors.textSubtle,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    lineHeight: 20,
  },
});
