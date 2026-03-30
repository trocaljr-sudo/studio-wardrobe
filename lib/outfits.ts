import { supabase, supabaseImagesBucket } from './supabase';
import { ensureActiveWardrobe, type ClothingItem, fetchWardrobeItems } from './wardrobe';

export type Occasion = {
  id: string;
  name: string;
};

export type OutfitSummary = {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  itemCount: number;
  imageUrl: string | null;
  occasions: string[];
  tags: string[];
};

type OutfitRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
};

type OutfitItemRow = {
  outfit_id: string;
  clothing_item_id: string;
  position: number | null;
  clothing_items: {
    id: string;
    name: string;
    image_path: string | null;
  }[] | null;
};

type OutfitOccasionRow = {
  outfit_id: string;
  occasions: { id: string; name: string }[] | null;
};

type OutfitTagRow = {
  outfit_id: string;
  tags: { id: string; name: string }[] | null;
};

async function cleanupOutfit(outfitId: string) {
  await supabase.from('outfit_items').delete().eq('outfit_id', outfitId);
  await supabase.from('outfit_occasions').delete().eq('outfit_id', outfitId);
  await supabase.from('outfit_tags').delete().eq('outfit_id', outfitId);
  await supabase.from('outfits').delete().eq('id', outfitId);
}

export async function fetchOccasions() {
  const { data, error } = await supabase.from('occasions').select('id, name').order('name');

  if (error) {
    throw error;
  }

  return (data ?? []) as Occasion[];
}

export async function fetchSelectableClothingItems(userId: string) {
  const { items } = await fetchWardrobeItems(userId);
  return items;
}

export async function createOutfit(input: {
  clothingItems: ClothingItem[];
  description?: string;
  name: string;
  occasionIds?: string[];
  ownerId: string;
  tagIds?: string[];
}) {
  const wardrobeId = await ensureActiveWardrobe(input.ownerId);

  const { data: outfit, error: outfitError } = await supabase
    .from('outfits')
    .insert({
      owner_id: input.ownerId,
      wardrobe_id: wardrobeId,
      name: input.name.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
    })
    .select('id, name, description, created_at')
    .single<OutfitRow>();

  if (outfitError) {
    throw outfitError;
  }

  const outfitItemRows = input.clothingItems.map((item, index) => ({
    outfit_id: outfit.id,
    clothing_item_id: item.id,
    position: index,
  }));

  const { error: outfitItemsError } = await supabase.from('outfit_items').insert(outfitItemRows);

  if (outfitItemsError) {
    await cleanupOutfit(outfit.id);
    throw outfitItemsError;
  }

  if (input.occasionIds && input.occasionIds.length > 0) {
    const occasionRows = input.occasionIds.map((occasionId) => ({
      outfit_id: outfit.id,
      occasion_id: occasionId,
    }));

    const { error: occasionError } = await supabase.from('outfit_occasions').insert(occasionRows);

    if (occasionError) {
      await cleanupOutfit(outfit.id);
      throw occasionError;
    }
  }

  if (input.tagIds && input.tagIds.length > 0) {
    const tagRows = input.tagIds.map((tagId) => ({
      outfit_id: outfit.id,
      tag_id: tagId,
    }));

    const { error: tagsError } = await supabase.from('outfit_tags').insert(tagRows);

    if (tagsError) {
      await cleanupOutfit(outfit.id);
      throw tagsError;
    }
  }

  return outfit;
}

export async function fetchOutfits(userId: string) {
  await ensureActiveWardrobe(userId);

  const { data: outfits, error: outfitsError } = await supabase
    .from('outfits')
    .select('id, name, description, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (outfitsError) {
    throw outfitsError;
  }

  const outfitRows = (outfits ?? []) as OutfitRow[];
  const outfitIds = outfitRows.map((outfit) => outfit.id);

  if (outfitIds.length === 0) {
    return [] as OutfitSummary[];
  }

  const [{ data: outfitItems, error: itemsError }, { data: outfitOccasions, error: occasionsError }, { data: outfitTags, error: tagsError }] =
    await Promise.all([
      supabase
        .from('outfit_items')
        .select('outfit_id, clothing_item_id, position, clothing_items(id, name, image_path)')
        .in('outfit_id', outfitIds)
        .order('position', { ascending: true }),
      supabase
        .from('outfit_occasions')
        .select('outfit_id, occasions(id, name)')
        .in('outfit_id', outfitIds),
      supabase.from('outfit_tags').select('outfit_id, tags(id, name)').in('outfit_id', outfitIds),
    ]);

  if (itemsError) {
    throw itemsError;
  }

  if (occasionsError) {
    throw occasionsError;
  }

  if (tagsError) {
    throw tagsError;
  }

  const itemsByOutfit = new Map<string, OutfitItemRow[]>();
  ((outfitItems ?? []) as OutfitItemRow[]).forEach((row) => {
    const existing = itemsByOutfit.get(row.outfit_id) ?? [];
    existing.push(row);
    itemsByOutfit.set(row.outfit_id, existing);
  });

  const occasionsByOutfit = new Map<string, string[]>();
  ((outfitOccasions ?? []) as OutfitOccasionRow[]).forEach((row) => {
    const names = row.occasions?.map((occasion) => occasion.name) ?? [];
    const existing = occasionsByOutfit.get(row.outfit_id) ?? [];
    occasionsByOutfit.set(row.outfit_id, [...existing, ...names]);
  });

  const tagsByOutfit = new Map<string, string[]>();
  ((outfitTags ?? []) as OutfitTagRow[]).forEach((row) => {
    const names = row.tags?.map((tag) => tag.name) ?? [];
    const existing = tagsByOutfit.get(row.outfit_id) ?? [];
    tagsByOutfit.set(row.outfit_id, [...existing, ...names]);
  });

  const previewUrlMap = new Map<string, string | null>();

  await Promise.all(
    outfitRows.map(async (outfit) => {
      const firstItemImagePath =
        itemsByOutfit
          .get(outfit.id)
          ?.map((row) => row.clothing_items?.[0]?.image_path ?? null)
          .find(Boolean) ?? null;

      if (!firstItemImagePath) {
        previewUrlMap.set(outfit.id, null);
        return;
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(supabaseImagesBucket)
        .createSignedUrl(firstItemImagePath, 60 * 60);

      if (signedUrlError) {
        previewUrlMap.set(outfit.id, null);
        return;
      }

      previewUrlMap.set(outfit.id, signedUrlData.signedUrl);
    })
  );

  return outfitRows.map((outfit) => ({
    id: outfit.id,
    name: outfit.name,
    description: outfit.description,
    created_at: outfit.created_at,
    itemCount: itemsByOutfit.get(outfit.id)?.length ?? 0,
    imageUrl: previewUrlMap.get(outfit.id) ?? null,
    occasions: occasionsByOutfit.get(outfit.id) ?? [],
    tags: tagsByOutfit.get(outfit.id) ?? [],
  }));
}
