import type { EventSummary } from './events';
import type { OutfitDetail, OutfitSummary } from './outfits';
import type { BuiltLookSuggestion, RecommendedOutfit } from './recommendations';
import type { ClothingItem } from './wardrobe';

export type StylePreset =
  | 'casual'
  | 'business'
  | 'formal'
  | 'streetwear'
  | 'minimal'
  | 'date-night'
  | 'gym'
  | 'vacation'
  | 'monochrome'
  | 'bold';

export type AIContextPayload = {
  builtLooks: {
    items: { id: string; name: string }[];
    reasons: string[];
    title: string;
  }[];
  events: {
    id: number;
    occasionName: string | null;
    scheduledDate: string | null;
    title: string;
  }[];
  items: {
    brand: string | null;
    category: string | null;
    color: string | null;
    id: string;
    material: string | null;
    name: string;
    size: string | null;
    tags: string[];
  }[];
  outfits: {
    id: string;
    itemIds: string[];
    name: string;
    occasions: string[];
    tags: string[];
  }[];
  ruleRecommendations: {
    id: string;
    reasons: string[];
    score: number;
  }[];
  styleProfile: {
    favoriteBrands: string[];
    favoriteItemIds: string[];
    favoriteOutfitIds: string[];
    goToOutfitIds: string[];
    preferredCategoryNames: string[];
    preferredColors: string[];
    preferredOccasionNames: string[];
    recentlyLikedOutfitIds: string[];
    summaryLines: string[];
  };
};

export type AIPromptRequest = {
  count: number;
  eventId?: number | null;
  focus: 'outfit-suggestions' | 'gap-analysis';
  prompt: string;
  preset?: StylePreset | null;
};

export function createAIContextPayload(input: {
  builtLooks: BuiltLookSuggestion[];
  events: EventSummary[];
  items: ClothingItem[];
  outfitDetails: OutfitDetail[];
  outfits: OutfitSummary[];
  recommendedOutfits: RecommendedOutfit[];
  styleProfile: {
    favoriteBrands: string[];
    favoriteItemIds: string[];
    favoriteOutfitIds: string[];
    goToOutfitIds: string[];
    preferredCategoryNames: string[];
    preferredColors: string[];
    preferredOccasionNames: string[];
    recentlyLikedOutfitIds: string[];
    summaryLines: string[];
  };
}) {
  const outfitDetailsById = new Map(input.outfitDetails.map((outfit) => [outfit.id, outfit]));

  return {
    items: input.items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.categoryName,
      brand: item.brandName,
      color: item.color,
      size: item.size,
      material: item.material,
      tags: item.tagNames,
    })),
    outfits: input.outfits.map((outfit) => ({
      id: outfit.id,
      name: outfit.name,
      itemIds: outfitDetailsById.get(outfit.id)?.items.map((item) => item.id) ?? [],
      occasions: outfit.occasions.map((occasion) => occasion.name),
      tags: outfit.tags.map((tag) => tag.name),
    })),
    ruleRecommendations: input.recommendedOutfits.map((recommendation) => ({
      id: recommendation.outfit.id,
      reasons: recommendation.reasons,
      score: recommendation.score,
    })),
    events: input.events.map((event) => ({
      id: event.id,
      title: event.title,
      scheduledDate: event.scheduledDate,
      occasionName: event.occasion?.name ?? null,
    })),
    builtLooks: input.builtLooks.map((look) => ({
      title: look.title,
      reasons: look.reasons,
      items: look.items.map((item) => ({ id: item.id, name: item.name })),
    })),
    styleProfile: input.styleProfile,
  } as AIContextPayload;
}

export function buildStyleAIInstructions(input: {
  event: EventSummary | null;
  profileSummaryLines: string[];
  prompt: string;
  count: number;
  preset?: StylePreset | null;
}) {
  const presetLine = input.preset
    ? `The user selected the preset "${input.preset}". Treat that as a strong style direction.`
    : 'No preset was selected.';
  const eventLine = input.event
    ? `The request is tied to the event "${input.event.title}" on ${input.event.scheduledDate ?? 'an unscheduled date'}${input.event.occasion ? ` with the occasion ${input.event.occasion.name}` : ''}.`
    : 'This request is not tied to a specific event.';
  const profileLine =
    input.profileSummaryLines.length > 0
      ? `Personal style signals to respect: ${input.profileSummaryLines.join(' ')}`
      : 'There are not many personalized signals yet, so stay grounded in rule-based recommendations.';

  return [
    'You are Studio Wardrobe, a premium styling assistant.',
    'You must only suggest clothing item IDs that appear in the provided wardrobe context.',
    'Never invent items, colors, brands, or outfits that are not in the provided data.',
    'Use the rule-based recommendations as grounding, not as a hard ceiling.',
    'Return concise, stylish, practical suggestions.',
    'Each outfit suggestion needs a clear rationale tied to real owned pieces.',
    'For gap analysis, recommend category-level or item-type-level additions only.',
    presetLine,
    eventLine,
    profileLine,
    `The user asked: ${input.prompt}`,
    `Return up to ${input.count} outfit suggestions when the focus is outfit-suggestions.`,
  ].join('\n');
}
