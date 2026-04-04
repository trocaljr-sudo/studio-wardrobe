import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackground } from '../../lib/ambient-background';
import { updateEvent } from '../../lib/events';
import { type StylePreset } from '../../lib/style-ai-prompt';
import { recordFeedback } from '../../lib/personalization';
import {
  type AIContextBundle,
  requestAIStyling,
  saveAIStyleSuggestionAsOutfit,
  type AIStylingResult,
} from '../../lib/style-ai';
import { useSession } from '../../lib/session';
import { useTheme } from '../../lib/theme';

const PRESETS: { id: StylePreset; label: string; prompt: string }[] = [
  { id: 'casual', label: 'Casual', prompt: 'Give me a casual look from my wardrobe.' },
  { id: 'date-night', label: 'Date Night', prompt: 'Give me a date-night look from my wardrobe.' },
  { id: 'business', label: 'Business', prompt: 'Build a polished business outfit from my wardrobe.' },
  { id: 'gym', label: 'Gym', prompt: 'Suggest a gym-ready outfit from my wardrobe.' },
  { id: 'travel', label: 'Travel', prompt: 'Build a comfortable travel outfit from my wardrobe.' },
];

const GAP_PROMPTS = [
  'What am I missing for everyday outfits?',
  'What would improve my wardrobe for business looks?',
  'What gaps do you see for travel and layering?',
];

function getConfidenceTier(score: number) {
  if (score >= 90) {
    return 'Strong fit';
  }

  if (score >= 78) {
    return 'High confidence';
  }

  if (score >= 66) {
    return 'Promising option';
  }

  return 'Could work';
}

function buildSuggestionPreview(
  suggestion: AIStylingResult['suggestions'][number],
  context: AIContextBundle | null
) {
  if (!context) {
    return [];
  }

  const sourceOutfit = suggestion.sourceOutfitId
    ? context.outfitDetails.find((outfit) => outfit.id === suggestion.sourceOutfitId)
    : null;

  if (sourceOutfit) {
    return sourceOutfit.items;
  }

  const itemMap = new Map(context.items.map((item) => [item.id, item]));
  return suggestion.itemIds
    .map((itemId) => itemMap.get(itemId) ?? null)
    .filter((item): item is NonNullable<typeof item> => item != null);
}

export default function StyleAIScreen() {
  const { user } = useSession();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { eventId: eventIdParam } = useLocalSearchParams<{ eventId?: string }>();
  const eventId = eventIdParam ? Number(eventIdParam) : null;
  const [focus, setFocus] = useState<'outfit-suggestions' | 'gap-analysis'>('outfit-suggestions');
  const [selectedPreset, setSelectedPreset] = useState<StylePreset | null>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<(AIStylingResult & { context: AIContextBundle }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      return;
    }

    setFocus('outfit-suggestions');
    if (!prompt.trim()) {
      setPrompt('What should I wear to this event? Give me 3 grounded options.');
    }
  }, [eventId, prompt]);

  const activePreset = useMemo(
    () => PRESETS.find((preset) => preset.id === selectedPreset) ?? null,
    [selectedPreset]
  );

  const runStyling = async (nextPromptOverride?: string) => {
    if (!user) {
      setErrorMessage('Sign in again before using Style AI.');
      return;
    }

    const nextPrompt =
      nextPromptOverride?.trim() ||
      prompt.trim() ||
      activePreset?.prompt ||
      (focus === 'gap-analysis'
        ? 'What am I missing from my wardrobe right now?'
        : 'Give me 3 strong outfit ideas from my wardrobe.');

    setLoading(true);
    setErrorMessage(null);

    try {
      const nextResult = await requestAIStyling(user.id, {
        focus,
        prompt: nextPrompt,
        count: 3,
        eventId,
        preset: selectedPreset,
      });
      setResult(nextResult);
      setPrompt(nextPrompt);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Style AI could not respond right now.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    await runStyling();
  };

  const handleRegenerate = async () => {
    await runStyling(prompt);
  };

  const handleSaveSuggestion = async (suggestion: AIStylingResult['suggestions'][number]) => {
    if (!user) {
      return;
    }

    setSavingId(suggestion.label);
    setErrorMessage(null);

    try {
      const occasionId =
        result?.context?.event?.occasion?.id ??
        null;

      const outfit = await saveAIStyleSuggestionAsOutfit({
        ownerId: user.id,
        label: suggestion.label,
        description: suggestion.rationale,
        itemIds: suggestion.itemIds,
        occasionId,
      });
      await recordFeedback({
        userId: user.id,
        targetType: suggestion.sourceOutfitId ? 'outfit' : 'suggestion',
        targetId: suggestion.sourceOutfitId ?? null,
        itemIds: suggestion.itemIds,
        signal: 'like',
        source: 'ai',
      });
      router.push(`/outfits/${outfit.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save that AI suggestion.';
      setErrorMessage(message);
    } finally {
      setSavingId(null);
    }
  };

  const handleSuggestionFeedback = async (
    suggestion: AIStylingResult['suggestions'][number],
    signal: 'like' | 'dislike'
  ) => {
    if (!user) {
      return;
    }

    try {
      await recordFeedback({
        userId: user.id,
        targetType: suggestion.sourceOutfitId ? 'outfit' : 'suggestion',
        targetId: suggestion.sourceOutfitId ?? null,
        itemIds: suggestion.itemIds,
        signal,
        source: 'ai',
      });
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save that AI feedback right now.';
      setErrorMessage(message);
    }
  };

  const handleAssignSuggestion = async (suggestion: AIStylingResult['suggestions'][number]) => {
    if (!user || !result) {
      return;
    }

    const targetEvent =
      result.context.event ??
      result.context.upcomingEvents.find((event) => !event.isPast) ??
      null;

    if (!targetEvent) {
      setErrorMessage('Create an event first, then you can assign AI looks to it.');
      return;
    }

    setAssigningId(suggestion.label);
    setErrorMessage(null);

    try {
      let outfitId = suggestion.sourceOutfitId ?? null;

      if (!outfitId) {
        const savedOutfit = await saveAIStyleSuggestionAsOutfit({
          ownerId: user.id,
          label: suggestion.label,
          description: suggestion.rationale,
          itemIds: suggestion.itemIds,
          occasionId: targetEvent.occasion?.id ?? null,
        });
        outfitId = savedOutfit.id;
      }

      await updateEvent({
        eventId: targetEvent.id,
        title: targetEvent.title,
        scheduledDate: targetEvent.scheduledDate ?? new Date().toISOString().slice(0, 10),
        scheduledTime: targetEvent.scheduledTime ?? '',
        notes: targetEvent.notes ?? '',
        occasionId: targetEvent.occasion?.id ?? null,
        outfitId,
        userId: user.id,
      });

      await recordFeedback({
        userId: user.id,
        targetType: suggestion.sourceOutfitId ? 'outfit' : 'suggestion',
        targetId: suggestion.sourceOutfitId ?? null,
        itemIds: suggestion.itemIds,
        signal: 'like',
        source: 'ai',
      });

      router.push(`/events/${targetEvent.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to assign that AI suggestion right now.';
      setErrorMessage(message);
    } finally {
      setAssigningId(null);
    }
  };

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

          <Text style={styles.title}>Style AI</Text>
          <Text style={styles.body}>
            Start with a styling mode, then let Studio Wardrobe turn your real closet into ready-to-wear looks and smarter buying advice.
          </Text>

          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => setFocus('outfit-suggestions')}
              style={[styles.segment, focus === 'outfit-suggestions' && styles.segmentActive]}
            >
              <Text
                style={[styles.segmentText, focus === 'outfit-suggestions' && styles.segmentTextActive]}
              >
                Outfit ideas
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFocus('gap-analysis')}
              style={[styles.segment, focus === 'gap-analysis' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, focus === 'gap-analysis' && styles.segmentTextActive]}>
                Wardrobe gaps
              </Text>
            </Pressable>
          </View>

          <View style={styles.promptCard}>
            <Text style={styles.cardLabel}>
              {focus === 'outfit-suggestions' ? 'Choose a styling direction' : 'Ask what is missing'}
            </Text>
            {focus === 'outfit-suggestions' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.presetRow}>
                  {PRESETS.map((preset) => (
                    <Pressable
                      key={preset.id}
                      onPress={() => {
                        setSelectedPreset(preset.id);
                        setPrompt(preset.prompt);
                      }}
                      style={[styles.presetChip, selectedPreset === preset.id && styles.presetChipActive]}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          selectedPreset === preset.id && styles.presetChipTextActive,
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.gapPromptWrap}>
                {GAP_PROMPTS.map((gapPrompt) => (
                  <Pressable
                    key={gapPrompt}
                    onPress={() => setPrompt(gapPrompt)}
                    style={styles.gapPromptChip}
                  >
                    <Text style={styles.gapPromptText}>{gapPrompt}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <TextInput
              multiline
              onChangeText={setPrompt}
              placeholder={
                focus === 'outfit-suggestions'
                  ? 'Optional: refine the vibe, color story, or occasion.'
                  : 'Optional: ask about missing categories, layering, or seasonal gaps.'
              }
              placeholderTextColor={colors.placeholder}
              style={styles.promptInput}
              value={prompt}
            />

            <View style={styles.primaryActionRow}>
              <Pressable
                disabled={loading}
                onPress={handleRun}
                style={[styles.primaryButton, loading && styles.disabledButton]}
              >
                <Text style={styles.primaryButtonText}>
                  {loading
                    ? 'Thinking...'
                    : focus === 'outfit-suggestions'
                      ? 'Generate 3 looks'
                      : 'Analyze my closet'}
                </Text>
              </Pressable>
              <Pressable
                disabled={loading || (!prompt.trim() && !activePreset)}
                onPress={handleRegenerate}
                style={[styles.secondaryActionButton, (loading || (!prompt.trim() && !activePreset)) && styles.disabledButton]}
              >
                <Text style={styles.secondaryActionButtonText}>Regenerate</Text>
              </Pressable>
            </View>
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.helperText}>Building grounded suggestions...</Text>
            </View>
          ) : null}

          {result ? (
            <View style={styles.resultsSection}>
              <View style={styles.resultHeader}>
                <Text style={styles.sectionTitle}>Results</Text>
                <Text style={styles.resultBadge}>
                  {result.generatedWith === 'ai' ? 'AI + rules' : 'Rule-based fallback'}
                </Text>
              </View>
              <Text style={styles.sectionBody}>{result.promptSummary}</Text>

              {focus === 'outfit-suggestions'
                ? result.suggestions.map((suggestion) => (
                    <View key={suggestion.label} style={styles.resultCard}>
                      <View style={styles.resultTitleRow}>
                        <Text style={styles.resultTitle}>{suggestion.label}</Text>
                        <View style={styles.confidencePill}>
                          <Text style={styles.confidencePillText}>
                            {suggestion.confidenceScore}% · {getConfidenceTier(suggestion.confidenceScore)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.resultMeta}>
                        {suggestion.itemNames.length > 0
                          ? suggestion.itemNames.join(' · ')
                          : 'Grounded in one of your saved outfits'}
                      </Text>
                      {buildSuggestionPreview(suggestion, result.context).length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.previewRow}
                        >
                          {buildSuggestionPreview(suggestion, result.context).map((item) => (
                            <View key={`${suggestion.label}-${item.id}`} style={styles.previewCard}>
                              <View style={styles.previewImageFrame}>
                                {item.imageUrl ? (
                                  <Image
                                    resizeMode="contain"
                                    source={{ uri: item.imageUrl }}
                                    style={styles.previewImage}
                                  />
                                ) : (
                                  <View style={styles.previewFallback}>
                                    <Text style={styles.previewFallbackText}>No image</Text>
                                  </View>
                                )}
                              </View>
                              <Text numberOfLines={1} style={styles.previewName}>
                                {item.name}
                              </Text>
                              <Text numberOfLines={1} style={styles.previewMeta}>
                                {item.categoryName ?? item.color ?? 'Wardrobe piece'}
                              </Text>
                            </View>
                          ))}
                        </ScrollView>
                      ) : null}
                      <Text style={styles.resultBody}>{suggestion.rationale}</Text>
                      <Text style={styles.confidenceText}>
                        {suggestion.confidenceLabel === 'grounded'
                          ? 'Grounded in saved wardrobe data'
                          : 'Exploratory mix built from your wardrobe'}
                      </Text>
                      <View style={styles.actionRow}>
                        <Pressable
                          onPress={() => handleSuggestionFeedback(suggestion, 'like')}
                          style={styles.secondaryButton}
                        >
                          <Text style={styles.secondaryButtonText}>👍 Like</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleSuggestionFeedback(suggestion, 'dislike')}
                          style={styles.secondaryButton}
                        >
                          <Text style={styles.secondaryButtonText}>👎 Dislike</Text>
                        </Pressable>
                        {suggestion.sourceOutfitId ? (
                          <Pressable
                            onPress={() => router.push(`/outfits/${suggestion.sourceOutfitId}`)}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>View outfit</Text>
                          </Pressable>
                        ) : null}
                        {suggestion.itemIds.length > 0 ? (
                          <Pressable
                            disabled={savingId === suggestion.label}
                            onPress={() => handleSaveSuggestion(suggestion)}
                            style={[styles.secondaryButton, savingId === suggestion.label && styles.disabledButton]}
                          >
                            <Text style={styles.secondaryButtonText}>
                              {savingId === suggestion.label ? 'Saving...' : 'Save'}
                            </Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          disabled={assigningId === suggestion.label}
                          onPress={() => handleAssignSuggestion(suggestion)}
                          style={[styles.secondaryButton, assigningId === suggestion.label && styles.disabledButton]}
                        >
                          <Text style={styles.secondaryButtonText}>
                            {assigningId === suggestion.label
                              ? 'Assigning...'
                              : eventId
                                ? 'Assign to event'
                                : 'Assign to next event'}
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={loading}
                          onPress={handleRegenerate}
                          style={[styles.secondaryButton, loading && styles.disabledButton]}
                        >
                          <Text style={styles.secondaryButtonText}>Regenerate</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                : result.gaps.map((gap) => (
                    <View key={gap.label} style={styles.resultCard}>
                      <Text style={styles.resultTitle}>{gap.label}</Text>
                      <Text style={styles.resultBody}>{gap.rationale}</Text>
                    </View>
                  ))}
            </View>
          ) : null}
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: 980,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  backText: {
    color: colors.accent,
    fontWeight: '600',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    color: colors.textMuted,
    lineHeight: 22,
  },
  promptCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segment: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  segmentText: {
    color: colors.text,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.accent,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gapPromptWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  presetChipText: {
    color: colors.text,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: colors.accent,
  },
  gapPromptChip: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  gapPromptText: {
    color: colors.text,
    fontWeight: '600',
  },
  promptInput: {
    minHeight: 110,
    textAlignVertical: 'top',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  primaryActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
    flex: 1,
  },
  primaryButtonText: {
    color: colors.accentText,
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryActionButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  secondaryActionButtonText: {
    color: colors.text,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  helperText: {
    color: colors.textMuted,
  },
  error: {
    color: colors.danger,
    lineHeight: 20,
  },
  resultsSection: {
    gap: 14,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  resultBadge: {
    color: colors.accent,
    fontWeight: '700',
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  sectionBody: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  resultTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  confidencePill: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  confidencePillText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  resultMeta: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  previewRow: {
    gap: 10,
    paddingVertical: 4,
  },
  previewCard: {
    width: 116,
    gap: 6,
  },
  previewImageFrame: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 108,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 10,
    width: 116,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFallbackText: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  previewName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  previewMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  resultBody: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  confidenceText: {
    color: colors.accent,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    backgroundColor: colors.accentMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryButtonText: {
    color: colors.accent,
    fontWeight: '700',
  },
});
