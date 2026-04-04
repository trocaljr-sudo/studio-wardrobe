import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  { id: 'business', label: 'Business', prompt: 'Build a polished business outfit from my wardrobe.' },
  { id: 'formal', label: 'Formal', prompt: 'Suggest a formal outfit from my wardrobe.' },
  { id: 'streetwear', label: 'Streetwear', prompt: 'Create a streetwear-inspired look from my wardrobe.' },
  { id: 'minimal', label: 'Minimal', prompt: 'Build a clean minimal outfit from my wardrobe.' },
  { id: 'date-night', label: 'Date Night', prompt: 'Give me a date-night look from my wardrobe.' },
  { id: 'gym', label: 'Gym', prompt: 'Suggest a gym-ready outfit from my wardrobe.' },
  { id: 'vacation', label: 'Vacation', prompt: 'Build an easy vacation outfit from my wardrobe.' },
  { id: 'monochrome', label: 'Monochrome', prompt: 'Build a monochrome outfit from my wardrobe.' },
  { id: 'bold', label: 'Bold', prompt: 'Give me a bold statement outfit from my wardrobe.' },
];

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

  const handleRun = async () => {
    if (!user) {
      setErrorMessage('Sign in again before using Style AI.');
      return;
    }

    const nextPrompt = prompt.trim() || activePreset?.prompt || 'Give me a strong outfit idea from my wardrobe.';

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
            Ask for grounded outfit ideas or a wardrobe gap check. The AI only works from your own wardrobe context, with rule-based fallback if it misses.
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

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.presetRow}>
              {PRESETS.map((preset) => (
                <Pressable
                  key={preset.id}
                  onPress={() => {
                    setSelectedPreset(preset.id);
                    if (!prompt.trim()) {
                      setPrompt(preset.prompt);
                    }
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

          <TextInput
            multiline
            onChangeText={setPrompt}
            placeholder={
              focus === 'outfit-suggestions'
                ? 'Ask for an outfit idea, like “Build a monochrome look for date night.”'
                : 'Ask what would strengthen your wardrobe, like “What am I missing for summer business outfits?”'
            }
            placeholderTextColor={colors.placeholder}
            style={styles.promptInput}
            value={prompt}
          />

          <Pressable
            disabled={loading}
            onPress={handleRun}
            style={[styles.primaryButton, loading && styles.disabledButton]}
          >
            <Text style={styles.primaryButtonText}>{loading ? 'Thinking...' : 'Run Style AI'}</Text>
          </Pressable>

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
                      <Text style={styles.resultTitle}>{suggestion.label}</Text>
                      <Text style={styles.resultMeta}>
                        {suggestion.itemNames.length > 0
                          ? suggestion.itemNames.join(', ')
                          : 'Based on a saved outfit already in your wardrobe'}
                      </Text>
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
                              {savingId === suggestion.label ? 'Saving...' : 'Save as outfit'}
                            </Text>
                          </Pressable>
                        ) : null}
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
  promptInput: {
    minHeight: 120,
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
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.accentText,
    fontWeight: '700',
    fontSize: 16,
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
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  resultMeta: {
    color: colors.textMuted,
    lineHeight: 20,
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
