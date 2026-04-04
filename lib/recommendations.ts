import { fetchEventDetail, fetchEvents, type EventSummary } from './events';
import {
  fetchOccasions,
  fetchOutfitDetail,
  fetchOutfits,
  type Occasion,
  type OutfitDetail,
  type OutfitSummary,
} from './outfits';
import {
  deriveUserStyleProfile,
  fetchStoredStyleProfile,
  type DerivedStyleProfile,
} from './personalization';
import { fetchWearHistory, type WearHistorySnapshot } from './wear-history';
import { fetchWardrobeItems, type ClothingItem } from './wardrobe';

export type RecommendationMode =
  | 'best-match'
  | 'event-based'
  | 'unworn-pieces'
  | 'build-from-items';

export type WeatherMode = 'any' | 'cold' | 'mild' | 'warm' | 'rainy';

export type RecommendedOutfit = {
  breakdown: {
    categoryBalance: number;
    colorHarmony: number;
    matchQuality: number;
    styleAlignment: number;
  };
  createdAt: string | null;
  feedbackSignal: 'like' | 'dislike' | null;
  isFavorite: boolean;
  itemCount: number;
  name: string;
  outfit: OutfitSummary;
  personalReasonCount: number;
  reasons: string[];
  score: number;
  scoreLabel: string;
  scorePercent: number;
};

export type RecommendedItem = {
  item: ClothingItem;
  reasons: string[];
};

export type ClosetInsight = {
  body: string;
  id: string;
  kind: 'go-to' | 'rotation' | 'unused' | 'multiplier';
  title: string;
};

export type OutfitMultiplier = {
  item: ClothingItem;
  outfitCount: number;
  reason: string;
};

export type BuiltLookSuggestion = {
  id: string;
  items: ClothingItem[];
  reasons: string[];
  score: number;
  scoreLabel: string;
  title: string;
};

export type BuilderAssistantSuggestion = {
  item: ClothingItem;
  reasons: string[];
  score: number;
};

type DetailedOutfitRecommendation = {
  eventCount: number;
  eventCountPast: number;
  itemCategories: string[];
  items: ClothingItem[];
  lastWornAt: string | null;
  occasionNames: string[];
  outfit: OutfitSummary;
  tagNames: string[];
  wearCount: number;
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function uniqueReasons(reasons: string[]) {
  return Array.from(new Set(reasons)).slice(0, 3);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function extractKeywords(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function categorizeItem(item: ClothingItem) {
  const category = normalize(item.categoryName);
  const name = normalize(item.name);
  const source = `${category} ${name}`;

  if (
    /dress|jumpsuit|romper/.test(source)
  ) {
    return 'one-piece';
  }

  if (
    /shoe|sneaker|boot|heel|loafer|sandal|trainer/.test(source)
  ) {
    return 'shoes';
  }

  if (
    /pant|jean|skirt|short|legging|trouser/.test(source)
  ) {
    return 'bottom';
  }

  if (
    /coat|jacket|blazer|cardigan|outerwear/.test(source)
  ) {
    return 'outerwear';
  }

  if (
    /shirt|tee|t-shirt|blouse|top|sweater|hoodie|tank|knit/.test(source)
  ) {
    return 'top';
  }

  return 'other';
}

function isNeutralColor(color: string | null | undefined) {
  const value = normalize(color);
  return ['black', 'white', 'gray', 'grey', 'navy', 'beige', 'brown', 'cream', 'tan'].some(
    (token) => value.includes(token)
  );
}

function classifyWeatherFit(items: ClothingItem[]) {
  const haystack = items
    .flatMap((item) => [item.name, item.categoryName, item.material, ...item.tagNames])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    cold:
      /coat|jacket|hoodie|sweater|knit|wool|fleece|boot|outerwear/.test(haystack),
    warm:
      /short|tank|tee|linen|dress|sandal|slide|swim|lightweight/.test(haystack),
    rainy:
      /boot|jacket|coat|outerwear|waterproof|rain/.test(haystack),
  };
}

function weatherReason(mode: WeatherMode) {
  if (mode === 'cold') {
    return 'Supports cooler weather layering';
  }

  if (mode === 'warm') {
    return 'Feels lighter for warmer weather';
  }

  if (mode === 'rainy') {
    return 'Includes pieces that can handle rainy conditions';
  }

  if (mode === 'mild') {
    return 'Balanced enough for an in-between day';
  }

  return null;
}

function buildColorPalette(items: ClothingItem[]) {
  return unique(items.map((item) => normalize(item.color)).filter(Boolean));
}

function calculateColorHarmony(items: ClothingItem[]) {
  const palette = buildColorPalette(items);

  if (palette.length === 0) {
    return 12;
  }

  if (palette.length === 1) {
    return 22;
  }

  const neutralCount = items.filter((item) => isNeutralColor(item.color)).length;

  if (palette.length <= 3) {
    return 18 + Math.min(8, neutralCount * 2);
  }

  return 10 + Math.min(6, neutralCount);
}

function calculateCategoryBalance(categories: string[]) {
  const uniqueCategories = unique(categories);
  const hasOnePiece = uniqueCategories.includes('one-piece');
  const hasTop = uniqueCategories.includes('top');
  const hasBottom = uniqueCategories.includes('bottom');
  const hasShoes = uniqueCategories.includes('shoes');
  const hasOuterwear = uniqueCategories.includes('outerwear');

  let score = 0;

  if (hasOnePiece) {
    score += 18;
  }

  if (hasTop) {
    score += 12;
  }

  if (hasBottom) {
    score += 12;
  }

  if (hasShoes) {
    score += 10;
  }

  if (hasOuterwear) {
    score += 4;
  }

  if ((hasTop && hasBottom) || (hasOnePiece && hasShoes)) {
    score += 8;
  }

  return clamp(score, 0, 32);
}

function scoreLabelForPercent(scorePercent: number) {
  if (scorePercent >= 85) {
    return 'Strong fit';
  }

  if (scorePercent >= 70) {
    return 'Good option';
  }

  return 'Could improve';
}

function outfitHasMatchingKeywords(outfit: DetailedOutfitRecommendation, keywords: string[]) {
  if (keywords.length === 0) {
    return false;
  }

  const haystack = [
    outfit.outfit.name,
    outfit.outfit.description ?? '',
    ...outfit.occasionNames,
    ...outfit.tagNames,
  ]
    .join(' ')
    .toLowerCase();

  return keywords.some((keyword) => haystack.includes(keyword));
}

function outfitMatchesPreferredVibe(
  outfit: DetailedOutfitRecommendation,
  preferredVibe: DerivedStyleProfile['preferredVibe']
) {
  if (!preferredVibe) {
    return false;
  }

  const haystack = [
    outfit.outfit.name,
    outfit.outfit.description ?? '',
    ...outfit.occasionNames,
    ...outfit.tagNames,
    ...outfit.items.map((item) => item.name),
    ...outfit.items.map((item) => item.categoryName ?? ''),
  ]
    .join(' ')
    .toLowerCase();

  if (preferredVibe === 'business') {
    return /business|office|work|polish|blazer|loafer|trouser|button|shirt|meeting/.test(haystack);
  }

  if (preferredVibe === 'streetwear') {
    return /streetwear|hoodie|graphic|sneaker|cargo|oversized|jogger|cap|tee/.test(haystack);
  }

  return /casual|weekend|everyday|denim|tee|sweater|sneaker|hoodie|travel/.test(haystack);
}

function computeOutfitRecommendation(params: {
  event?: EventSummary | null;
  outfit: DetailedOutfitRecommendation;
  profile: DerivedStyleProfile;
  selectedOccasion?: Occasion | null;
  weatherMode?: WeatherMode | null;
}) {
  const { event, outfit, profile, selectedOccasion, weatherMode } = params;
  const reasons: string[] = [];
  let matchQuality = 14;
  let styleAlignment = 10;
  let personalReasonCount = 0;

  const feedbackSignal = profile.outfitFeedback[outfit.outfit.id] ?? null;
  const isFavorite = profile.favoriteOutfitIds.includes(outfit.outfit.id);

  const hasOccasionMatch =
    !!selectedOccasion &&
    outfit.outfit.occasions.some((occasion) => occasion.id === selectedOccasion.id);

  if (hasOccasionMatch && selectedOccasion) {
    matchQuality += 28;
    reasons.push(`Matches your ${selectedOccasion.name} occasion`);
  }

  if (isFavorite) {
    styleAlignment += 18;
    reasons.push('One of your favorite saved outfits');
    personalReasonCount += 1;
  }

  if (feedbackSignal === 'like') {
    styleAlignment += 14;
    reasons.push('You have liked this kind of look before');
    personalReasonCount += 1;
  }

  if (feedbackSignal === 'dislike') {
    styleAlignment -= 18;
    reasons.push('You previously marked this look as a weaker fit');
    personalReasonCount += 1;
  }

  if (outfitMatchesPreferredVibe(outfit, profile.preferredVibe)) {
    styleAlignment += 12;
    reasons.push(`Feels aligned with your ${profile.preferredVibe} style direction`);
    personalReasonCount += 1;
  }

  if (
    outfit.occasionNames.some((occasionName) =>
      profile.preferredOccasionNames.includes(normalize(occasionName))
    )
  ) {
    styleAlignment += 10;
    reasons.push('Lines up with the occasions you reach for most');
    personalReasonCount += 1;
  }

  const eventKeywords = event ? extractKeywords(event.title) : [];
  if (event && outfitHasMatchingKeywords(outfit, eventKeywords)) {
    matchQuality += 12;
    reasons.push(`Fits this event's ${event.title} vibe`);
  }

  const categoryBalance = calculateCategoryBalance(outfit.itemCategories);
  const colorHarmony = calculateColorHarmony(outfit.items);
  const weatherFit = classifyWeatherFit(outfit.items);

  const matchedPreferredColors = unique(
    outfit.items
      .map((item) => normalize(item.color))
      .filter((color) => color && profile.preferredColors.includes(color))
  );

  if (matchedPreferredColors.length > 0) {
    styleAlignment += 8;
    reasons.push(`Uses colors you keep returning to, like ${matchedPreferredColors.join(', ')}`);
    personalReasonCount += 1;
  }

  const matchedPreferredCategories = unique(
    outfit.items
      .map((item) => normalize(item.categoryName))
      .filter((category) => category && profile.preferredCategoryNames.includes(category))
  );

  if (matchedPreferredCategories.length > 0) {
    styleAlignment += 8;
    reasons.push(`Includes piece types you gravitate toward, like ${matchedPreferredCategories.join(', ')}`);
    personalReasonCount += 1;
  }

  if (outfit.outfit.itemCount >= 3) {
    matchQuality += 4;
  }

  if (outfit.eventCount === 0) {
    matchQuality += 8;
    reasons.push('Has not been planned for an event yet');
  } else if (outfit.eventCount === 1) {
    matchQuality += 3;
    reasons.push('Has only been planned once so far');
  }

  if (!selectedOccasion && outfit.outfit.occasions.length > 0) {
    matchQuality += 2;
  }

  if (outfit.wearCount === 0) {
    matchQuality += 6;
    reasons.push('Has not been marked as worn yet');
  } else if (outfit.wearCount >= 3) {
    matchQuality -= 4;
    reasons.push('Already in heavy rotation, so the app is giving fresher looks a bump');
  }

  if (weatherMode && weatherMode !== 'any') {
    if (weatherMode === 'cold' && weatherFit.cold) {
      matchQuality += 8;
      reasons.push(weatherReason(weatherMode)!);
    } else if (weatherMode === 'warm' && weatherFit.warm) {
      matchQuality += 8;
      reasons.push(weatherReason(weatherMode)!);
    } else if (weatherMode === 'rainy' && weatherFit.rainy) {
      matchQuality += 8;
      reasons.push(weatherReason(weatherMode)!);
    } else if (weatherMode === 'mild' && !weatherFit.cold && !weatherFit.warm) {
      matchQuality += 6;
      reasons.push(weatherReason(weatherMode)!);
    }
  }

  if (categoryBalance >= 24) {
    reasons.push('Balanced mix of core categories');
  }

  if (colorHarmony >= 18) {
    reasons.push('Colors play well together');
  }

  const score = clamp(matchQuality + styleAlignment + categoryBalance + colorHarmony, 0, 100);
  const scorePercent = score;
  const scoreLabel = scoreLabelForPercent(scorePercent);

  return {
    breakdown: {
      matchQuality: clamp(matchQuality, 0, 32),
      styleAlignment: clamp(styleAlignment, 0, 24),
      categoryBalance,
      colorHarmony,
    },
    createdAt: outfit.outfit.created_at,
    feedbackSignal,
    isFavorite,
    itemCount: outfit.outfit.itemCount,
    name: outfit.outfit.name,
    outfit: outfit.outfit,
    personalReasonCount,
    reasons: uniqueReasons(reasons),
    score,
    scoreLabel,
    scorePercent,
  } as RecommendedOutfit;
}

function sortRecommendedOutfits(recommendations: RecommendedOutfit[]) {
  return [...recommendations].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return (right.createdAt ?? '').localeCompare(left.createdAt ?? '');
  });
}

function buildDetailedOutfitMap(
  outfits: OutfitSummary[],
  details: OutfitDetail[],
  events: EventSummary[],
  wearHistory?: WearHistorySnapshot | null
) {
  const pastEvents = events.filter((event) => event.isPast);

  return outfits.map((outfit) => {
    const detail = details.find((entry) => entry.id === outfit.id);
    const items = detail?.items ?? [];
    const relatedEvents = events.filter((event) => event.outfit?.id === outfit.id);
    const pastRelatedEvents = pastEvents
      .filter((event) => event.outfit?.id === outfit.id)
      .sort((left, right) =>
        `${right.scheduledDate ?? ''}${right.scheduledTime ?? ''}`.localeCompare(
          `${left.scheduledDate ?? ''}${left.scheduledTime ?? ''}`
        )
      );

    return {
      outfit,
      items,
      itemCategories: items.map((item) => categorizeItem(item)),
      occasionNames: outfit.occasions.map((occasion) => occasion.name),
      tagNames: outfit.tags.map((tag) => tag.name),
      eventCount: relatedEvents.length,
      eventCountPast: pastRelatedEvents.length,
      lastWornAt:
        wearHistory?.outfitLastWorn.get(outfit.id) ?? pastRelatedEvents[0]?.scheduledDate ?? null,
      wearCount: wearHistory?.outfitWearCounts.get(outfit.id) ?? 0,
    } as DetailedOutfitRecommendation;
  });
}

function buildUnusedItemRecommendations(
  items: ClothingItem[],
  profile: DerivedStyleProfile,
  usedItemIds: Set<string>
) {
  return items
    .filter((item) => !usedItemIds.has(item.id))
    .slice(0, 8)
    .map((item) => ({
      item,
      reasons: [
        'Not used in any saved outfit yet',
        profile.favoriteItemIds.includes(item.id)
          ? 'Already marked as a favorite item'
          : profile.preferredCategoryNames.includes(normalize(item.categoryName))
            ? 'Falls inside the categories you usually prefer'
            : 'Fresh candidate for your next rotation',
        isNeutralColor(item.color)
          ? 'Neutral color makes it easy to pair'
          : 'Ready to anchor a new look',
      ],
    })) as RecommendedItem[];
}

function buildItemOutfitCountMap(details: OutfitDetail[]) {
  const map = new Map<string, number>();

  details.forEach((detail) => {
    detail.items.forEach((item) => {
      map.set(item.id, (map.get(item.id) ?? 0) + 1);
    });
  });

  return map;
}

function buildItemLastWornMap(details: OutfitDetail[], events: EventSummary[]) {
  const detailMap = new Map(details.map((detail) => [detail.id, detail]));
  const itemLastWorn = new Map<string, string>();

  events
    .filter((event) => event.isPast && event.outfit?.id && event.scheduledDate)
    .sort((left, right) => (right.scheduledDate ?? '').localeCompare(left.scheduledDate ?? ''))
    .forEach((event) => {
      const detail = detailMap.get(event.outfit!.id);
      if (!detail || !event.scheduledDate) {
        return;
      }

      detail.items.forEach((item) => {
        if (!itemLastWorn.has(item.id)) {
          itemLastWorn.set(item.id, event.scheduledDate!);
        }
      });
    });

  return itemLastWorn;
}

function getUpcomingAnchorEvent(events: EventSummary[]) {
  return events.find((event) => !event.isPast) ?? null;
}

function buildTodaySuggestions(params: {
  anchorEvent: EventSummary | null;
  recommendedOutfits: RecommendedOutfit[];
}) {
  const { anchorEvent, recommendedOutfits } = params;
  const todaySuggestions = recommendedOutfits.slice(0, 3);
  const todayContext = anchorEvent
    ? `Built around your upcoming ${anchorEvent.title} plan${anchorEvent.occasion ? ` and its ${anchorEvent.occasion.name} occasion` : ''}.`
    : 'Built from your best matches, favorite signals, and pieces that are not overused.';

  return {
    todaySuggestions,
    todayContext,
  };
}

function buildTodayContext(params: {
  anchorEvent: EventSummary | null;
  weatherMode: WeatherMode;
}) {
  const { anchorEvent, weatherMode } = params;
  const weatherSuffix =
    weatherMode !== 'any' ? ` Weather mode is set to ${weatherMode}.` : '';

  if (anchorEvent) {
    return `Built around your upcoming ${anchorEvent.title} plan${anchorEvent.occasion ? ` and its ${anchorEvent.occasion.name} occasion` : ''}.${weatherSuffix}`;
  }

  return `Built from your best matches, favorite signals, and pieces that are not overused.${weatherSuffix}`;
}

function buildClosetInsights(params: {
  items: ClothingItem[];
  itemLastWornMap: Map<string, string>;
  itemOutfitCounts: Map<string, number>;
  itemWearCounts: Map<string, number>;
  profile: DerivedStyleProfile;
}) {
  const { items, itemLastWornMap, itemOutfitCounts, itemWearCounts, profile } = params;
  const insights: ClosetInsight[] = [];
  const rankedItems = [...items].sort(
    (left, right) => (itemOutfitCounts.get(right.id) ?? 0) - (itemOutfitCounts.get(left.id) ?? 0)
  );

  const mostWornItem = [...items].sort(
    (left, right) => (itemWearCounts.get(right.id) ?? 0) - (itemWearCounts.get(left.id) ?? 0)
  )[0];

  if (mostWornItem && (itemWearCounts.get(mostWornItem.id) ?? 0) > 0) {
    const count = itemWearCounts.get(mostWornItem.id) ?? 0;
    insights.push({
      id: `most-worn-${mostWornItem.id}`,
      kind: 'go-to',
      title: `${mostWornItem.name} is one of your most worn pieces`,
      body: `It has been marked worn ${count} ${count === 1 ? 'time' : 'times'}, which makes it a true go-to in your current rotation.`,
    });
  }

  const goToItem = rankedItems.find((item) => (itemOutfitCounts.get(item.id) ?? 0) >= 2);
  if (goToItem) {
    const count = itemOutfitCounts.get(goToItem.id) ?? 0;
    insights.push({
      id: `go-to-${goToItem.id}`,
      kind: 'go-to',
      title: `${goToItem.name} is one of your go-to pieces`,
      body: `It already shows up in ${count} saved outfits${profile.favoriteItemIds.includes(goToItem.id) ? ' and you marked it as a favorite' : ''}.`,
    });
  }

  const unusedItem = rankedItems.find((item) => (itemOutfitCounts.get(item.id) ?? 0) === 0);
  if (unusedItem) {
    insights.push({
      id: `unused-${unusedItem.id}`,
      kind: 'unused',
      title: `You have not used ${unusedItem.name} in a saved outfit yet`,
      body: 'It is a strong candidate for your next look if you want to rotate more of the closet into play.',
    });
  }

  const staleItem = rankedItems.find((item) => {
    const lastWorn = itemLastWornMap.get(item.id);
    if (!lastWorn) {
      return false;
    }

    const ageInDays = Math.floor(
      (Date.now() - new Date(`${lastWorn}T12:00:00`).getTime()) / (1000 * 60 * 60 * 24)
    );

    return ageInDays >= 30;
  });

  if (staleItem) {
    const lastWorn = itemLastWornMap.get(staleItem.id)!;
    const ageInDays = Math.floor(
      (Date.now() - new Date(`${lastWorn}T12:00:00`).getTime()) / (1000 * 60 * 60 * 24)
    );
    insights.push({
      id: `stale-${staleItem.id}`,
      kind: 'rotation',
      title: `You haven't worn ${staleItem.name} in ${ageInDays} days`,
      body: 'Based on your tracked event history, this piece has been out of rotation for a while and could use a fresh look.',
    });
  }

  const lowUtilityItem = rankedItems.find((item) => (itemOutfitCounts.get(item.id) ?? 0) === 1);
  if (lowUtilityItem) {
    insights.push({
      id: `rotation-${lowUtilityItem.id}`,
      kind: 'rotation',
      title: `${lowUtilityItem.name} currently only works with 1 saved outfit`,
      body: 'Try building around it to increase its versatility and get more value out of the piece.',
    });
  }

  return insights.slice(0, 3);
}

function buildOutfitMultipliers(params: {
  items: ClothingItem[];
  itemOutfitCounts: Map<string, number>;
}) {
  return [...params.items]
    .filter((item) => (params.itemOutfitCounts.get(item.id) ?? 0) > 0)
    .sort(
      (left, right) =>
        (params.itemOutfitCounts.get(right.id) ?? 0) - (params.itemOutfitCounts.get(left.id) ?? 0)
    )
    .slice(0, 5)
    .map((item) => {
      const outfitCount = params.itemOutfitCounts.get(item.id) ?? 0;
      return {
        item,
        outfitCount,
        reason: `${item.name} works in ${outfitCount} ${outfitCount === 1 ? 'outfit' : 'outfits'}.`,
      } as OutfitMultiplier;
    });
}

function chooseBestItem(
  items: ClothingItem[],
  params: {
    occasionName?: string | null;
    preferUnusedIds: Set<string>;
    usedIds: Set<string>;
  }
) {
  const { occasionName, preferUnusedIds, usedIds } = params;
  const occasionToken = normalize(occasionName);

  const ranked = [...items].sort((left, right) => {
    const leftScore =
      (occasionToken &&
      left.tagNames.some((tag) => normalize(tag).includes(occasionToken))
        ? 25
        : 0) +
      (preferUnusedIds.has(left.id) ? 16 : 0) +
      (isNeutralColor(left.color) ? 8 : 0) +
      (usedIds.has(left.id) ? 0 : 4);
    const rightScore =
      (occasionToken &&
      right.tagNames.some((tag) => normalize(tag).includes(occasionToken))
        ? 25
        : 0) +
      (preferUnusedIds.has(right.id) ? 16 : 0) +
      (isNeutralColor(right.color) ? 8 : 0) +
      (usedIds.has(right.id) ? 0 : 4);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return (right.created_at ?? '').localeCompare(left.created_at ?? '');
  });

  return ranked[0] ?? null;
}

function buildWardrobeLookSuggestions(params: {
  items: ClothingItem[];
  profile: DerivedStyleProfile;
  selectedOccasion?: Occasion | null;
  usedItemIds: Set<string>;
}) {
  const { items, profile, selectedOccasion, usedItemIds } = params;
  const preferUnusedIds = new Set(items.filter((item) => !usedItemIds.has(item.id)).map((item) => item.id));
  const byCategory = {
    top: items.filter((item) => categorizeItem(item) === 'top'),
    bottom: items.filter((item) => categorizeItem(item) === 'bottom'),
    shoes: items.filter((item) => categorizeItem(item) === 'shoes'),
    outerwear: items.filter((item) => categorizeItem(item) === 'outerwear'),
    onePiece: items.filter((item) => categorizeItem(item) === 'one-piece'),
  };

  const suggestions: BuiltLookSuggestion[] = [];

  const top = chooseBestItem(byCategory.top, {
    occasionName: selectedOccasion?.name,
    preferUnusedIds,
    usedIds: usedItemIds,
  });
  const bottom = chooseBestItem(byCategory.bottom, {
    occasionName: selectedOccasion?.name,
    preferUnusedIds,
    usedIds: usedItemIds,
  });
  const shoes = chooseBestItem(byCategory.shoes, {
    occasionName: selectedOccasion?.name,
    preferUnusedIds,
    usedIds: usedItemIds,
  });
  const outerwear = chooseBestItem(byCategory.outerwear, {
    occasionName: selectedOccasion?.name,
    preferUnusedIds,
    usedIds: usedItemIds,
  });
  const onePiece = chooseBestItem(byCategory.onePiece, {
    occasionName: selectedOccasion?.name,
    preferUnusedIds,
    usedIds: usedItemIds,
  });

  if (onePiece && shoes) {
    suggestions.push({
      id: `one-piece-${onePiece.id}-${shoes.id}`,
      title: selectedOccasion
        ? `${selectedOccasion.name} one-piece look`
        : 'Easy one-piece outfit',
      items: outerwear ? [onePiece, shoes, outerwear] : [onePiece, shoes],
      score: 82,
      scoreLabel: scoreLabelForPercent(82),
      reasons: uniqueReasons([
        'Pairs a one-piece look with shoes for quick styling',
        profile.preferredCategoryNames.includes(normalize(onePiece.categoryName))
          ? 'Centers a silhouette you already seem to like'
          : 'Keeps the silhouette straightforward and easy to style',
        preferUnusedIds.has(onePiece.id) || preferUnusedIds.has(shoes.id)
          ? 'Brings in pieces you have not used in a saved outfit yet'
          : 'Builds from strong wardrobe staples',
        isNeutralColor(onePiece.color) || isNeutralColor(shoes.color)
          ? 'Uses neutral colors that are easy to finish'
          : 'Leaves room for statement accessories later',
      ]),
    });
  }

  if (top && bottom) {
    const comboItems = [top, bottom, shoes, outerwear].filter(Boolean) as ClothingItem[];
    suggestions.push({
      id: `separates-${comboItems.map((item) => item.id).join('-')}`,
      title: selectedOccasion
        ? `${selectedOccasion.name} separates`
        : 'Balanced wardrobe starter',
      items: comboItems,
      score: 76,
      scoreLabel: scoreLabelForPercent(76),
      reasons: uniqueReasons([
        'Covers top and bottom for a grounded starting point',
        comboItems.some((item) => profile.favoriteItemIds.includes(item.id))
          ? 'Starts from at least one piece you have explicitly favorited'
          : 'Keeps the base practical and wearable',
        shoes ? 'Includes shoes so the look already feels complete' : 'Leaves space to swap in your favorite shoes',
        comboItems.some((item) => preferUnusedIds.has(item.id))
          ? 'Pulls in at least one piece not used in a saved outfit yet'
          : 'Reuses dependable pieces from your closet',
      ]),
    });
  }

  return suggestions.slice(0, 2);
}

export function buildBuilderAssistantSuggestions(params: {
  items: ClothingItem[];
  profile: Pick<DerivedStyleProfile, 'favoriteItemIds' | 'preferredCategoryNames' | 'preferredColors'>;
  selectedOccasionNames?: string[];
  selectedTagNames?: string[];
  selectedItemIds: string[];
}) {
  const { items, profile, selectedItemIds, selectedOccasionNames = [], selectedTagNames = [] } = params;
  const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));
  const selectedSet = new Set(selectedItemIds);
  const selectedCategories = new Set(selectedItems.map((item) => categorizeItem(item)));
  const selectedColors = buildColorPalette(selectedItems);

  return items
    .filter((item) => !selectedSet.has(item.id))
    .map((item) => {
      const reasons: string[] = [];
      let score = 0;
      const category = categorizeItem(item);
      const color = normalize(item.color);

      if (selectedCategories.has('bottom') && category === 'top') {
        score += 30;
        reasons.push('Balances your current selection with a top');
      }

      if (selectedCategories.has('top') && category === 'bottom') {
        score += 30;
        reasons.push('Balances your current selection with a bottom');
      }

      if (!selectedCategories.has('shoes') && category === 'shoes') {
        score += 24;
        reasons.push('Helps complete the look with footwear');
      }

      if (profile.favoriteItemIds.includes(item.id)) {
        score += 18;
        reasons.push('You already marked this as a favorite');
      }

      if (profile.preferredCategoryNames.includes(normalize(item.categoryName))) {
        score += 10;
        reasons.push('Matches the categories you usually reach for');
      }

      if (color && profile.preferredColors.includes(color)) {
        score += 10;
        reasons.push('Uses a color you tend to like');
      }

      if (selectedColors.length > 0 && (selectedColors.includes(color) || isNeutralColor(item.color))) {
        score += 8;
        reasons.push('Fits the color story of what you already picked');
      }

      if (
        selectedOccasionNames.some((occasion) =>
          item.tagNames.some((tag) => normalize(tag).includes(normalize(occasion)))
        )
      ) {
        score += 12;
        reasons.push('Matches the occasion you are building around');
      }

      if (
        selectedTagNames.some((selectedTag) =>
          item.tagNames.some((tag) => normalize(tag) === normalize(selectedTag))
        )
      ) {
        score += 8;
        reasons.push('Shares tags with the direction you selected');
      }

      if (selectedItems.length === 0) {
        score += profile.favoriteItemIds.includes(item.id) ? 6 : 0;
      }

      return {
        item,
        score,
        reasons: uniqueReasons(reasons),
      } as BuilderAssistantSuggestion;
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

export async function fetchRecommendations(
  userId: string,
  occasionId?: string | null,
  weatherMode: WeatherMode = 'any'
) {
  const [itemsResult, outfits, occasions, events, storedProfile, wearHistory] = await Promise.all([
    fetchWardrobeItems(userId),
    fetchOutfits(userId),
    fetchOccasions(),
    fetchEvents(userId),
    fetchStoredStyleProfile(userId),
    fetchWearHistory(userId),
  ]);

  const detailedOutfits = await Promise.all(outfits.map((outfit) => fetchOutfitDetail(userId, outfit.id)));
  const detailedRecommendationOutfits = buildDetailedOutfitMap(outfits, detailedOutfits, events, wearHistory);
  const profile = deriveUserStyleProfile({
    storedProfile,
    items: itemsResult.items,
    outfits,
    outfitDetails: detailedOutfits,
    events,
  });
  const occasion = occasions.find((entry) => entry.id === occasionId) ?? null;
  const recommendedOutfits = sortRecommendedOutfits(
    detailedRecommendationOutfits.map((outfit) =>
      computeOutfitRecommendation({
        outfit,
        profile,
        selectedOccasion: occasion,
        weatherMode,
      })
    )
  );
  const usedItemIds = new Set(
    detailedOutfits.flatMap((outfit) => outfit.items.map((item) => item.id))
  );
  const itemOutfitCounts = buildItemOutfitCountMap(detailedOutfits);
  const itemLastWornMap =
    wearHistory.available && wearHistory.itemLastWorn.size > 0
      ? wearHistory.itemLastWorn
      : buildItemLastWornMap(detailedOutfits, events);
  const unusedItems = buildUnusedItemRecommendations(itemsResult.items, profile, usedItemIds);
  const builtLooks = buildWardrobeLookSuggestions({
    items: itemsResult.items,
    profile,
    selectedOccasion: occasion,
    usedItemIds,
  });
  const anchorEvent = getUpcomingAnchorEvent(events);
  const { todaySuggestions } = buildTodaySuggestions({
    anchorEvent,
    recommendedOutfits,
  });
  const todayContext = buildTodayContext({
    anchorEvent,
    weatherMode,
  });
  const closetInsights = buildClosetInsights({
    items: itemsResult.items,
    itemLastWornMap,
    itemOutfitCounts,
    itemWearCounts: wearHistory.itemWearCounts,
    profile,
  });
  const outfitMultipliers = buildOutfitMultipliers({
    items: itemsResult.items,
    itemOutfitCounts,
  });

  return {
    closetInsights,
    dailyAnchorEvent: anchorEvent,
    occasions,
    outfitMultipliers,
    weatherMode,
    todayContext,
    todaySuggestions,
    upcomingEvents: events.filter((event) => !event.isPast).slice(0, 6),
    recommendedOutfits,
    personalizedOutfits: recommendedOutfits
      .filter((outfit) => outfit.personalReasonCount > 0 || outfit.isFavorite || outfit.feedbackSignal === 'like')
      .slice(0, 4),
    styleProfile: profile,
    unusedItems,
    builtLooks,
  };
}

export async function fetchEventRecommendations(userId: string, eventId: number) {
  const [event, outfits, storedProfile, wearHistory] = await Promise.all([
    fetchEventDetail(userId, eventId),
    fetchOutfits(userId),
    fetchStoredStyleProfile(userId),
    fetchWearHistory(userId),
  ]);
  const detailedOutfits = await Promise.all(outfits.map((outfit) => fetchOutfitDetail(userId, outfit.id)));
  const allEvents = await fetchEvents(userId);
  const detailedRecommendationOutfits = buildDetailedOutfitMap(
    outfits,
    detailedOutfits,
    allEvents,
    wearHistory
  );
  const profile = deriveUserStyleProfile({
    storedProfile,
    items: detailedOutfits.flatMap((outfit) => outfit.items),
    outfits,
    outfitDetails: detailedOutfits,
    events: allEvents,
  });

  const recommendations = sortRecommendedOutfits(
    detailedRecommendationOutfits
      .filter((outfit) => outfit.outfit.id !== event.outfit?.id)
      .map((outfit) =>
        computeOutfitRecommendation({
          event,
          outfit,
          profile,
          selectedOccasion: event.occasion,
        })
      )
  ).slice(0, 3);

  return {
    event,
    recommendations,
  };
}
