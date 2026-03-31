import { fetchEventDetail, fetchEvents, type EventSummary } from './events';
import {
  fetchOccasions,
  fetchOutfitDetail,
  fetchOutfits,
  type Occasion,
  type OutfitDetail,
  type OutfitSummary,
} from './outfits';
import { fetchWardrobeItems, type ClothingItem } from './wardrobe';

export type RecommendationMode =
  | 'best-match'
  | 'event-based'
  | 'unworn-pieces'
  | 'build-from-items';

export type RecommendedOutfit = {
  createdAt: string | null;
  itemCount: number;
  name: string;
  outfit: OutfitSummary;
  reasons: string[];
  score: number;
};

export type RecommendedItem = {
  item: ClothingItem;
  reasons: string[];
};

export type BuiltLookSuggestion = {
  id: string;
  items: ClothingItem[];
  reasons: string[];
  title: string;
};

type DetailedOutfitRecommendation = {
  eventCount: number;
  itemCategories: string[];
  items: ClothingItem[];
  occasionNames: string[];
  outfit: OutfitSummary;
  tagNames: string[];
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function uniqueReasons(reasons: string[]) {
  return Array.from(new Set(reasons)).slice(0, 3);
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

function computeOutfitRecommendation(params: {
  event?: EventSummary | null;
  outfit: DetailedOutfitRecommendation;
  selectedOccasion?: Occasion | null;
}) {
  const { event, outfit, selectedOccasion } = params;
  const reasons: string[] = [];
  let score = 0;

  const hasOccasionMatch =
    !!selectedOccasion &&
    outfit.outfit.occasions.some((occasion) => occasion.id === selectedOccasion.id);

  if (hasOccasionMatch && selectedOccasion) {
    score += 70;
    reasons.push(`Matches your ${selectedOccasion.name} occasion`);
  }

  const eventKeywords = event ? extractKeywords(event.title) : [];
  if (event && outfitHasMatchingKeywords(outfit, eventKeywords)) {
    score += 24;
    reasons.push(`Fits this event's ${event.title} vibe`);
  }

  if (outfit.itemCategories.includes('top') && outfit.itemCategories.includes('bottom')) {
    score += 14;
    reasons.push('Covers the core pieces for a complete look');
  }

  if (outfit.itemCategories.includes('shoes')) {
    score += 10;
    reasons.push('Already includes footwear in the outfit');
  }

  if (outfit.outfit.itemCount >= 3) {
    score += 8;
  }

  if (outfit.eventCount === 0) {
    score += 14;
    reasons.push('Has not been planned for an event yet');
  } else if (outfit.eventCount === 1) {
    score += 6;
    reasons.push('Has only been planned once so far');
  }

  if (!selectedOccasion && outfit.outfit.occasions.length > 0) {
    score += 5;
  }

  return {
    createdAt: outfit.outfit.created_at,
    itemCount: outfit.outfit.itemCount,
    name: outfit.outfit.name,
    outfit: outfit.outfit,
    reasons: uniqueReasons(reasons),
    score,
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
  events: EventSummary[]
) {
  return outfits.map((outfit) => {
    const detail = details.find((entry) => entry.id === outfit.id);
    const items = detail?.items ?? [];

    return {
      outfit,
      items,
      itemCategories: items.map((item) => categorizeItem(item)),
      occasionNames: outfit.occasions.map((occasion) => occasion.name),
      tagNames: outfit.tags.map((tag) => tag.name),
      eventCount: events.filter((event) => event.outfit?.id === outfit.id).length,
    } as DetailedOutfitRecommendation;
  });
}

function buildUnusedItemRecommendations(
  items: ClothingItem[],
  usedItemIds: Set<string>
) {
  return items
    .filter((item) => !usedItemIds.has(item.id))
    .slice(0, 8)
    .map((item) => ({
      item,
      reasons: [
        'Not used in any saved outfit yet',
        isNeutralColor(item.color)
          ? 'Neutral color makes it easy to pair'
          : 'Ready to anchor a new look',
      ],
    })) as RecommendedItem[];
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
  selectedOccasion?: Occasion | null;
  usedItemIds: Set<string>;
}) {
  const { items, selectedOccasion, usedItemIds } = params;
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
      reasons: uniqueReasons([
        'Pairs a one-piece look with shoes for quick styling',
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
      reasons: uniqueReasons([
        'Covers top and bottom for a grounded starting point',
        shoes ? 'Includes shoes so the look already feels complete' : 'Leaves space to swap in your favorite shoes',
        comboItems.some((item) => preferUnusedIds.has(item.id))
          ? 'Pulls in at least one piece not used in a saved outfit yet'
          : 'Reuses dependable pieces from your closet',
      ]),
    });
  }

  return suggestions.slice(0, 2);
}

export async function fetchRecommendations(userId: string, occasionId?: string | null) {
  const [itemsResult, outfits, occasions, events] = await Promise.all([
    fetchWardrobeItems(userId),
    fetchOutfits(userId),
    fetchOccasions(),
    fetchEvents(userId),
  ]);

  const detailedOutfits = await Promise.all(outfits.map((outfit) => fetchOutfitDetail(userId, outfit.id)));
  const detailedRecommendationOutfits = buildDetailedOutfitMap(outfits, detailedOutfits, events);
  const occasion = occasions.find((entry) => entry.id === occasionId) ?? null;
  const recommendedOutfits = sortRecommendedOutfits(
    detailedRecommendationOutfits.map((outfit) =>
      computeOutfitRecommendation({
        outfit,
        selectedOccasion: occasion,
      })
    )
  );
  const usedItemIds = new Set(
    detailedOutfits.flatMap((outfit) => outfit.items.map((item) => item.id))
  );
  const unusedItems = buildUnusedItemRecommendations(itemsResult.items, usedItemIds);
  const builtLooks = buildWardrobeLookSuggestions({
    items: itemsResult.items,
    selectedOccasion: occasion,
    usedItemIds,
  });

  return {
    occasions,
    upcomingEvents: events.filter((event) => !event.isPast).slice(0, 6),
    recommendedOutfits,
    unusedItems,
    builtLooks,
  };
}

export async function fetchEventRecommendations(userId: string, eventId: number) {
  const [event, outfits] = await Promise.all([
    fetchEventDetail(userId, eventId),
    fetchOutfits(userId),
  ]);
  const detailedOutfits = await Promise.all(outfits.map((outfit) => fetchOutfitDetail(userId, outfit.id)));
  const allEvents = await fetchEvents(userId);
  const detailedRecommendationOutfits = buildDetailedOutfitMap(outfits, detailedOutfits, allEvents);

  const recommendations = sortRecommendedOutfits(
    detailedRecommendationOutfits
      .filter((outfit) => outfit.outfit.id !== event.outfit?.id)
      .map((outfit) =>
        computeOutfitRecommendation({
          event,
          outfit,
          selectedOccasion: event.occasion,
        })
      )
  ).slice(0, 3);

  return {
    event,
    recommendations,
  };
}
