import { fetchEventDetail, fetchEvents, type EventSummary } from './events';
import {
  createOutfit,
  fetchOutfitDetail,
  fetchOutfits,
  type Occasion,
  type OutfitDetail,
  type OutfitSummary,
} from './outfits';
import {
  fetchRecommendations,
  fetchEventRecommendations,
  type BuiltLookSuggestion,
  type RecommendedOutfit,
} from './recommendations';
import { supabase } from './supabase';
import Constants from 'expo-constants';
import { fetchWardrobeItems, type ClothingItem } from './wardrobe';
import {
  buildStyleAIInstructions,
  createAIContextPayload,
  type AIPromptRequest,
  type StylePreset,
} from './style-ai-prompt';

export type AIStyleSuggestion = {
  confidenceScore: number;
  confidenceLabel: 'grounded' | 'exploratory';
  itemIds: string[];
  itemNames: string[];
  label: string;
  rationale: string;
  sourceOutfitId?: string | null;
};

export type AIGapInsight = {
  label: string;
  rationale: string;
};

export type AIStylingResult = {
  focus: 'outfit-suggestions' | 'gap-analysis';
  gaps: AIGapInsight[];
  generatedWith: 'ai' | 'fallback';
  promptSummary: string;
  suggestions: AIStyleSuggestion[];
};

export type AIContextBundle = {
  builtLooks: BuiltLookSuggestion[];
  event: EventSummary | null;
  items: ClothingItem[];
  occasions: Occasion[];
  outfitDetails: OutfitDetail[];
  outfits: OutfitSummary[];
  recommendedOutfits: RecommendedOutfit[];
  styleProfile: Awaited<ReturnType<typeof fetchRecommendations>>['styleProfile'];
  upcomingEvents: EventSummary[];
};

function createFallbackSuggestions(
  recommendations: RecommendedOutfit[],
  outfitDetails: OutfitDetail[],
  items: ClothingItem[],
  prompt: string
) {
  const detailMap = new Map(outfitDetails.map((outfit) => [outfit.id, outfit]));

  return recommendations.slice(0, 3).length > 0
    ? recommendations.slice(0, 3).map((recommendation) => ({
        confidenceScore: Math.max(62, Math.min(96, Math.round(recommendation.score * 100))),
        confidenceLabel: 'grounded',
        itemIds: detailMap.get(recommendation.outfit.id)?.items.map((item) => item.id) ?? [],
        itemNames: detailMap.get(recommendation.outfit.id)?.items.map((item) => item.name) ?? [],
        label: recommendation.outfit.name,
        rationale: recommendation.reasons.join('. '),
        sourceOutfitId: recommendation.outfit.id,
      }))
    : [
        {
          confidenceScore: 58,
          confidenceLabel: 'grounded',
          itemIds: [],
          itemNames: items.slice(0, 3).map((item) => item.name),
          label: 'Start from your wardrobe staples',
          rationale: `AI could not respond, so this falls back to your rule-based wardrobe guidance for "${prompt}".`,
          sourceOutfitId: null,
        },
      ];
}

function buildGapFallback(items: ClothingItem[]) {
  const categories = new Set(items.map((item) => item.categoryName?.toLowerCase()).filter(Boolean));
  const insights: AIGapInsight[] = [];

  if (!Array.from(categories).some((name) => name?.includes('shoe') || name?.includes('boot') || name?.includes('sneaker'))) {
    insights.push({
      label: 'Versatile shoes',
      rationale: 'A neutral everyday shoe would unlock more complete looks across your current wardrobe.',
    });
  }

  if (!Array.from(categories).some((name) => name?.includes('jacket') || name?.includes('coat') || name?.includes('blazer'))) {
    insights.push({
      label: 'Layering piece',
      rationale: 'A lightweight jacket or blazer would give your outfits more structure and occasion range.',
    });
  }

  if (!Array.from(categories).some((name) => name?.includes('pant') || name?.includes('jean') || name?.includes('skirt') || name?.includes('short'))) {
    insights.push({
      label: 'More bottoms',
      rationale: 'Your wardrobe would benefit from more bottom options to expand outfit combinations.',
    });
  }

  return insights.slice(0, 3);
}

export async function buildAIWardrobeContext(
  userId: string,
  request: AIPromptRequest
) {
  const [{ items }, recommendationState, outfits, events] = await Promise.all([
    fetchWardrobeItems(userId),
    fetchRecommendations(userId),
    fetchOutfits(userId),
    fetchEvents(userId),
  ]);
  const outfitDetails = await Promise.all(
    outfits.map((outfit) => fetchOutfitDetail(userId, outfit.id))
  );

  const event =
    request.eventId != null ? await fetchEventDetail(userId, request.eventId) : null;

  return {
    items,
    outfits,
    outfitDetails,
    events,
    event,
    occasions: recommendationState.occasions,
    recommendedOutfits:
      request.eventId != null
        ? (await fetchEventRecommendations(userId, request.eventId)).recommendations
        : recommendationState.recommendedOutfits,
    builtLooks: recommendationState.builtLooks,
    styleProfile: recommendationState.styleProfile,
    upcomingEvents: recommendationState.upcomingEvents,
  } as AIContextBundle;
}

export async function requestAIStyling(
  userId: string,
  request: AIPromptRequest
) {
  const context = await buildAIWardrobeContext(userId, request);
  const payload = createAIContextPayload({
    items: context.items,
    outfits: context.outfits,
    outfitDetails: context.outfitDetails,
    events: context.upcomingEvents,
    recommendedOutfits: context.recommendedOutfits,
    builtLooks: context.builtLooks,
    styleProfile: context.styleProfile,
  });
  const appConfig = Constants.expoConfig?.extra ?? {};
  const functionName = appConfig.styleAiFunctionName ?? 'style-ai';

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: {
        request,
        context: payload,
        instructions: buildStyleAIInstructions({
          event: context.event,
          profileSummaryLines: context.styleProfile.summaryLines,
          prompt: request.prompt,
          count: request.count,
          preset: request.preset,
        }),
      },
    });

    if (error) {
      throw error;
    }

    const result = data as AIStylingResult;
    const allowedItemIds = new Set(context.items.map((item) => item.id));
    const sourceOutfitIds = new Set(context.outfits.map((outfit) => outfit.id));

    return {
      ...result,
      suggestions: (result.suggestions ?? []).map((suggestion) => ({
        ...suggestion,
        confidenceScore: Math.max(55, Math.min(98, Math.round(suggestion.confidenceScore ?? 72))),
        itemIds: (suggestion.itemIds ?? []).filter((itemId) => allowedItemIds.has(itemId)),
        sourceOutfitId:
          suggestion.sourceOutfitId && sourceOutfitIds.has(suggestion.sourceOutfitId)
            ? suggestion.sourceOutfitId
            : null,
      })),
      context,
    };
  } catch {
    return {
      focus: request.focus,
      gaps:
        request.focus === 'gap-analysis' ? buildGapFallback(context.items) : [],
      generatedWith: 'fallback',
      promptSummary: request.prompt,
      suggestions:
        request.focus === 'outfit-suggestions'
          ? createFallbackSuggestions(
              context.recommendedOutfits,
              context.outfitDetails,
              context.items,
              request.prompt
            )
          : [],
      context,
    } as AIStylingResult & { context: AIContextBundle };
  }
}

export async function saveAIStyleSuggestionAsOutfit(input: {
  description?: string;
  itemIds: string[];
  label: string;
  occasionId?: string | null;
  ownerId: string;
}) {
  const { items } = await fetchWardrobeItems(input.ownerId);
  const selectedItems = items.filter((item) => input.itemIds.includes(item.id));

  if (selectedItems.length === 0) {
    throw new Error('This suggestion does not include any valid wardrobe items to save.');
  }

  return createOutfit({
    ownerId: input.ownerId,
    name: input.label,
    description: input.description,
    clothingItems: selectedItems,
    occasionIds: input.occasionId ? [input.occasionId] : [],
  });
}
