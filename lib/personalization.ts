import { supabase } from './supabase';
import type { EventSummary } from './events';
import type { OutfitDetail, OutfitSummary } from './outfits';
import type { ClothingItem } from './wardrobe';

export type FeedbackSignal = 'like' | 'dislike';
export type FeedbackSource = 'ai' | 'rules' | 'manual';
export type FeedbackTargetType = 'outfit' | 'item' | 'suggestion';

type ProfileRow = {
  favorite_brands: string[] | null;
  preferred_colors: string[] | null;
  style_profile: unknown;
};

export type StoredFeedbackEntry = {
  createdAt: string;
  id: string;
  itemIds: string[];
  signal: FeedbackSignal;
  source: FeedbackSource;
  targetId: string | null;
  targetType: FeedbackTargetType;
};

export type StoredStyleProfile = {
  favoriteItemIds: string[];
  favoriteOutfitIds: string[];
  feedback: StoredFeedbackEntry[];
  version: number;
};

export type PersonalizationSnapshot = {
  favoriteItemIds: string[];
  favoriteOutfitIds: string[];
  itemFeedback: Record<string, FeedbackSignal>;
  outfitFeedback: Record<string, FeedbackSignal>;
};

export type DerivedStyleProfile = PersonalizationSnapshot & {
  favoriteBrands: string[];
  goToOutfitIds: string[];
  preferredCategoryNames: string[];
  preferredColors: string[];
  preferredOccasionNames: string[];
  recentlyLikedOutfitIds: string[];
  summaryLines: string[];
};

const EMPTY_PROFILE: StoredStyleProfile = {
  version: 1,
  favoriteItemIds: [],
  favoriteOutfitIds: [],
  feedback: [],
};

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeFeedbackEntry(entry: unknown): StoredFeedbackEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidate = entry as Record<string, unknown>;
  const signal = candidate.signal;
  const targetType = candidate.targetType;
  const source = candidate.source;

  if (
    (signal !== 'like' && signal !== 'dislike') ||
    (targetType !== 'outfit' && targetType !== 'item' && targetType !== 'suggestion') ||
    (source !== 'ai' && source !== 'rules' && source !== 'manual')
  ) {
    return null;
  }

  return {
    id:
      typeof candidate.id === 'string'
        ? candidate.id
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt:
      typeof candidate.createdAt === 'string'
        ? candidate.createdAt
        : new Date().toISOString(),
    targetType,
    targetId: typeof candidate.targetId === 'string' ? candidate.targetId : null,
    itemIds: Array.isArray(candidate.itemIds)
      ? candidate.itemIds.filter((value): value is string => typeof value === 'string')
      : [],
    signal,
    source,
  };
}

function normalizeStoredStyleProfile(value: unknown): StoredStyleProfile {
  if (!value || typeof value !== 'object') {
    return EMPTY_PROFILE;
  }

  const candidate = value as Record<string, unknown>;

  return {
    version: typeof candidate.version === 'number' ? candidate.version : 1,
    favoriteItemIds: Array.isArray(candidate.favoriteItemIds)
      ? unique(candidate.favoriteItemIds.filter((entry): entry is string => typeof entry === 'string'))
      : [],
    favoriteOutfitIds: Array.isArray(candidate.favoriteOutfitIds)
      ? unique(candidate.favoriteOutfitIds.filter((entry): entry is string => typeof entry === 'string'))
      : [],
    feedback: Array.isArray(candidate.feedback)
      ? candidate.feedback
          .map((entry) => normalizeFeedbackEntry(entry))
          .filter(Boolean) as StoredFeedbackEntry[]
      : [],
  };
}

async function ensureProfile(userId: string) {
  const { error } = await supabase.from('profiles').upsert({ id: userId });

  if (error) {
    throw error;
  }
}

async function readProfileRow(userId: string) {
  await ensureProfile(userId);

  const { data, error } = await supabase
    .from('profiles')
    .select('style_profile, preferred_colors, favorite_brands')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function writeStoredStyleProfile(
  userId: string,
  profile: StoredStyleProfile,
  derived?: Partial<Pick<DerivedStyleProfile, 'favoriteBrands' | 'preferredColors'>>
) {
  await ensureProfile(userId);

  const { error } = await supabase
    .from('profiles')
    .update({
      style_profile: profile,
      style_profile_updated_at: new Date().toISOString(),
      preferred_colors: derived?.preferredColors ?? null,
      favorite_brands: derived?.favoriteBrands ?? null,
    })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}

export async function fetchStoredStyleProfile(userId: string) {
  const row = await readProfileRow(userId);
  return normalizeStoredStyleProfile(row?.style_profile);
}

function buildLatestFeedbackMap(
  entries: StoredFeedbackEntry[],
  targetType: FeedbackTargetType
) {
  const sorted = [...entries]
    .filter((entry) => entry.targetType === targetType && entry.targetId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const map = new Map<string, FeedbackSignal>();

  sorted.forEach((entry) => {
    if (!entry.targetId || map.has(entry.targetId)) {
      return;
    }

    map.set(entry.targetId, entry.signal);
  });

  return map;
}

export async function fetchPersonalizationSnapshot(userId: string) {
  const stored = await fetchStoredStyleProfile(userId);
  const itemFeedbackMap = buildLatestFeedbackMap(stored.feedback, 'item');
  const outfitFeedbackMap = buildLatestFeedbackMap(stored.feedback, 'outfit');

  return {
    favoriteItemIds: stored.favoriteItemIds,
    favoriteOutfitIds: stored.favoriteOutfitIds,
    itemFeedback: Object.fromEntries(itemFeedbackMap),
    outfitFeedback: Object.fromEntries(outfitFeedbackMap),
  } as PersonalizationSnapshot;
}

function incrementScore(map: Map<string, number>, key: string | null | undefined, amount: number) {
  const normalized = normalize(key);
  if (!normalized) {
    return;
  }

  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function topKeys(map: Map<string, number>, count = 3) {
  return [...map.entries()]
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, count)
    .map(([key]) => key);
}

export function deriveUserStyleProfile(input: {
  events: EventSummary[];
  items: ClothingItem[];
  outfits: OutfitSummary[];
  outfitDetails: OutfitDetail[];
  storedProfile: StoredStyleProfile;
}) {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const outfitById = new Map(input.outfits.map((outfit) => [outfit.id, outfit]));
  const outfitDetailById = new Map(input.outfitDetails.map((outfit) => [outfit.id, outfit]));
  const colorScores = new Map<string, number>();
  const categoryScores = new Map<string, number>();
  const brandScores = new Map<string, number>();
  const occasionScores = new Map<string, number>();
  const feedbackByOutfit = buildLatestFeedbackMap(input.storedProfile.feedback, 'outfit');
  const feedbackByItem = buildLatestFeedbackMap(input.storedProfile.feedback, 'item');

  input.storedProfile.favoriteItemIds.forEach((itemId) => {
    const item = itemById.get(itemId);
    if (!item) {
      return;
    }

    incrementScore(colorScores, item.color, 5);
    incrementScore(categoryScores, item.categoryName, 5);
    incrementScore(brandScores, item.brandName, 5);
  });

  input.storedProfile.favoriteOutfitIds.forEach((outfitId) => {
    const outfit = outfitById.get(outfitId);
    const detail = outfitDetailById.get(outfitId);

    outfit?.occasions.forEach((occasion) => incrementScore(occasionScores, occasion.name, 6));
    detail?.items.forEach((item) => {
      incrementScore(colorScores, item.color, 4);
      incrementScore(categoryScores, item.categoryName, 4);
      incrementScore(brandScores, item.brandName, 4);
    });
  });

  feedbackByItem.forEach((signal, itemId) => {
    const item = itemById.get(itemId);
    if (!item) {
      return;
    }

    const amount = signal === 'like' ? 4 : -6;
    incrementScore(colorScores, item.color, amount);
    incrementScore(categoryScores, item.categoryName, amount);
    incrementScore(brandScores, item.brandName, amount);
  });

  feedbackByOutfit.forEach((signal, outfitId) => {
    const outfit = outfitById.get(outfitId);
    const detail = outfitDetailById.get(outfitId);
    const amount = signal === 'like' ? 5 : -7;

    outfit?.occasions.forEach((occasion) => incrementScore(occasionScores, occasion.name, amount));
    detail?.items.forEach((item) => {
      incrementScore(colorScores, item.color, amount);
      incrementScore(categoryScores, item.categoryName, amount);
      incrementScore(brandScores, item.brandName, amount);
    });
  });

  const plannedOutfitCounts = new Map<string, number>();
  input.events.forEach((event) => {
    if (!event.outfit?.id) {
      return;
    }

    plannedOutfitCounts.set(event.outfit.id, (plannedOutfitCounts.get(event.outfit.id) ?? 0) + 1);
    event.outfit.occasions.forEach((occasion) => incrementScore(occasionScores, occasion.name, 2));
  });

  const recentlyLikedOutfitIds = [...input.storedProfile.feedback]
    .filter(
      (entry) => entry.targetType === 'outfit' && entry.targetId && entry.signal === 'like'
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((entry) => entry.targetId!)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 5);

  const goToOutfitIds = unique([
    ...input.storedProfile.favoriteOutfitIds,
    ...recentlyLikedOutfitIds,
    ...[...plannedOutfitCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([outfitId]) => outfitId),
  ]);

  const preferredColors = topKeys(colorScores);
  const preferredCategoryNames = topKeys(categoryScores);
  const favoriteBrands = topKeys(brandScores);
  const preferredOccasionNames = topKeys(occasionScores);

  const summaryLines = [
    preferredColors.length > 0
      ? `You keep returning to ${preferredColors.join(', ')} tones.`
      : null,
    preferredCategoryNames.length > 0
      ? `You lean toward ${preferredCategoryNames.join(', ')} pieces.`
      : null,
    preferredOccasionNames.length > 0
      ? `Your strongest occasion signals are ${preferredOccasionNames.join(', ')}.`
      : null,
    favoriteBrands.length > 0
      ? `Brands you favor most: ${favoriteBrands.join(', ')}.`
      : null,
  ].filter(Boolean) as string[];

  return {
    favoriteItemIds: input.storedProfile.favoriteItemIds,
    favoriteOutfitIds: input.storedProfile.favoriteOutfitIds,
    itemFeedback: Object.fromEntries(feedbackByItem),
    outfitFeedback: Object.fromEntries(feedbackByOutfit),
    preferredColors,
    preferredCategoryNames,
    favoriteBrands,
    preferredOccasionNames,
    recentlyLikedOutfitIds,
    goToOutfitIds,
    summaryLines:
      summaryLines.length > 0
        ? summaryLines
        : ['Style AI is still learning from what you save, favorite, and like.'],
  } as DerivedStyleProfile;
}

export async function recordFeedback(input: {
  itemIds?: string[];
  signal: FeedbackSignal;
  source: FeedbackSource;
  targetId?: string | null;
  targetType: FeedbackTargetType;
  userId: string;
}) {
  const stored = await fetchStoredStyleProfile(input.userId);
  const deduped = stored.feedback.filter((entry) => {
    const sameTarget =
      entry.targetType === input.targetType &&
      entry.source === input.source &&
      (entry.targetId ?? null) === (input.targetId ?? null);

    if (sameTarget) {
      return false;
    }

    if (
      input.targetType === 'suggestion' &&
      entry.targetType === 'suggestion' &&
      entry.source === input.source &&
      entry.itemIds.join('|') === (input.itemIds ?? []).join('|')
    ) {
      return false;
    }

    return true;
  });

  const nextProfile = {
    ...stored,
    feedback: [
      ...deduped,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        itemIds: input.itemIds ?? [],
        signal: input.signal,
        source: input.source,
      },
    ],
  } as StoredStyleProfile;

  await writeStoredStyleProfile(input.userId, nextProfile);
  return nextProfile;
}

export async function toggleFavoriteItem(userId: string, itemId: string) {
  const stored = await fetchStoredStyleProfile(userId);
  const nextFavoriteItemIds = stored.favoriteItemIds.includes(itemId)
    ? stored.favoriteItemIds.filter((value) => value !== itemId)
    : [...stored.favoriteItemIds, itemId];

  const nextProfile = {
    ...stored,
    favoriteItemIds: nextFavoriteItemIds,
  } as StoredStyleProfile;

  await writeStoredStyleProfile(userId, nextProfile);
  return nextProfile;
}

export async function toggleFavoriteOutfit(userId: string, outfitId: string) {
  const stored = await fetchStoredStyleProfile(userId);
  const nextFavoriteOutfitIds = stored.favoriteOutfitIds.includes(outfitId)
    ? stored.favoriteOutfitIds.filter((value) => value !== outfitId)
    : [...stored.favoriteOutfitIds, outfitId];

  const nextProfile = {
    ...stored,
    favoriteOutfitIds: nextFavoriteOutfitIds,
  } as StoredStyleProfile;

  await writeStoredStyleProfile(userId, nextProfile);
  return nextProfile;
}
