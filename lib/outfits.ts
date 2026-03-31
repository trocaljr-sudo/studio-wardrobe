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
  occasions: { id: string; name: string }[];
  tags: { id: string; name: string }[];
};

export type OutfitDetail = {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  imageUrl: string | null;
  items: ClothingItem[];
  occasions: Occasion[];
  tags: { id: string; name: string }[];
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
    color: string | null;
    category_id: string | null;
    brand_id: string | null;
    categories: { id: string; name: string }[] | null;
    brands: { id: string; name: string }[] | null;
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

async function createSignedImageUrl(path: string | null) {
  if (!path) {
    return null;
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(supabaseImagesBucket)
    .createSignedUrl(path, 60 * 60);

  if (signedUrlError) {
    return null;
  }

  return signedUrlData.signedUrl;
}

function mapClothingItem(
  clothingItem:
    | {
        id: string;
        name: string;
        image_path: string | null;
        color: string | null;
        category_id: string | null;
        brand_id: string | null;
        categories: { id: string; name: string }[] | null;
        brands: { id: string; name: string }[] | null;
      }
    | undefined,
  imageUrl: string | null
): ClothingItem | null {
  if (!clothingItem) {
    return null;
  }

  return {
    id: clothingItem.id,
    name: clothingItem.name,
    color: clothingItem.color,
    created_at: null,
    wardrobe_id: '',
    owner_id: '',
    image_path: clothingItem.image_path,
    imageUrl,
    size: null,
    material: null,
    category_id: clothingItem.category_id,
    brand_id: clothingItem.brand_id,
    categoryName: clothingItem.categories?.[0]?.name ?? null,
    brandName: clothingItem.brands?.[0]?.name ?? null,
    tagIds: [],
    tagNames: [],
  };
}

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
  const occasionObjectsByOutfit = new Map<string, { id: string; name: string }[]>();
  ((outfitOccasions ?? []) as OutfitOccasionRow[]).forEach((row) => {
    const values = row.occasions?.map((occasion) => ({ id: occasion.id, name: occasion.name })) ?? [];
    const names = values.map((occasion) => occasion.name);
    const existing = occasionsByOutfit.get(row.outfit_id) ?? [];
    occasionsByOutfit.set(row.outfit_id, [...existing, ...names]);
    const existingObjects = occasionObjectsByOutfit.get(row.outfit_id) ?? [];
    occasionObjectsByOutfit.set(row.outfit_id, [...existingObjects, ...values]);
  });

  const tagsByOutfit = new Map<string, string[]>();
  const tagObjectsByOutfit = new Map<string, { id: string; name: string }[]>();
  ((outfitTags ?? []) as OutfitTagRow[]).forEach((row) => {
    const values = row.tags?.map((tag) => ({ id: tag.id, name: tag.name })) ?? [];
    const names = values.map((tag) => tag.name);
    const existing = tagsByOutfit.get(row.outfit_id) ?? [];
    tagsByOutfit.set(row.outfit_id, [...existing, ...names]);
    const existingObjects = tagObjectsByOutfit.get(row.outfit_id) ?? [];
    tagObjectsByOutfit.set(row.outfit_id, [...existingObjects, ...values]);
  });

  const previewUrlMap = new Map<string, string | null>();

  await Promise.all(
    outfitRows.map(async (outfit) => {
      const firstItemImagePath =
        itemsByOutfit
          .get(outfit.id)
          ?.map((row) => row.clothing_items?.[0]?.image_path ?? null)
          .find(Boolean) ?? null;

      previewUrlMap.set(outfit.id, await createSignedImageUrl(firstItemImagePath));
    })
  );

  return outfitRows.map((outfit) => ({
    id: outfit.id,
    name: outfit.name,
    description: outfit.description,
    created_at: outfit.created_at,
    itemCount: itemsByOutfit.get(outfit.id)?.length ?? 0,
    imageUrl: previewUrlMap.get(outfit.id) ?? null,
    occasions: occasionObjectsByOutfit.get(outfit.id) ?? [],
    tags: tagObjectsByOutfit.get(outfit.id) ?? [],
  }));
}

export async function fetchOutfitDetail(userId: string, outfitId: string) {
  await ensureActiveWardrobe(userId);

  const { data: outfit, error: outfitError } = await supabase
    .from('outfits')
    .select('id, name, description, created_at')
    .eq('id', outfitId)
    .eq('owner_id', userId)
    .maybeSingle<OutfitRow>();

  if (outfitError) {
    throw outfitError;
  }

  if (!outfit) {
    throw new Error('Outfit not found.');
  }

  const [{ data: outfitItems, error: itemsError }, { data: outfitOccasions, error: occasionsError }, { data: outfitTags, error: tagsError }] =
    await Promise.all([
      supabase
        .from('outfit_items')
        .select(
          'outfit_id, clothing_item_id, position, clothing_items(id, name, image_path, color, category_id, brand_id, categories(id, name), brands(id, name))'
        )
        .eq('outfit_id', outfitId)
        .order('position', { ascending: true }),
      supabase.from('outfit_occasions').select('outfit_id, occasions(id, name)').eq('outfit_id', outfitId),
      supabase.from('outfit_tags').select('outfit_id, tags(id, name)').eq('outfit_id', outfitId),
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

  const outfitItemRows = (outfitItems ?? []) as OutfitItemRow[];
  const itemImageUrls = new Map<string, string | null>();

  await Promise.all(
    outfitItemRows.map(async (row) => {
      const clothingItem = row.clothing_items?.[0];
      if (!clothingItem) {
        return;
      }

      itemImageUrls.set(clothingItem.id, await createSignedImageUrl(clothingItem.image_path));
    })
  );

  const items = outfitItemRows
    .map((row) =>
      mapClothingItem(row.clothing_items?.[0], itemImageUrls.get(row.clothing_items?.[0]?.id ?? '') ?? null)
    )
    .filter(Boolean) as ClothingItem[];

  const previewUrl = await createSignedImageUrl(items[0]?.image_path ?? null);

  const occasions =
    ((outfitOccasions ?? []) as OutfitOccasionRow[])
      .flatMap((row) => row.occasions ?? [])
      .map((occasion) => ({ id: occasion.id, name: occasion.name })) ?? [];

  const tags =
    ((outfitTags ?? []) as OutfitTagRow[])
      .flatMap((row) => row.tags ?? [])
      .map((tag) => ({ id: tag.id, name: tag.name })) ?? [];

  return {
    id: outfit.id,
    name: outfit.name,
    description: outfit.description,
    created_at: outfit.created_at,
    imageUrl: previewUrl,
    items,
    occasions,
    tags,
  } as OutfitDetail;
}

export async function updateOutfit(input: {
  clothingItems: ClothingItem[];
  description?: string;
  name: string;
  occasionIds?: string[];
  outfitId: string;
  ownerId: string;
  tagIds?: string[];
}) {
  const { error: updateError } = await supabase
    .from('outfits')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
    })
    .eq('id', input.outfitId)
    .eq('owner_id', input.ownerId);

  if (updateError) {
    throw updateError;
  }

  const { error: deleteItemsError } = await supabase
    .from('outfit_items')
    .delete()
    .eq('outfit_id', input.outfitId);

  if (deleteItemsError) {
    throw deleteItemsError;
  }

  const outfitItemRows = input.clothingItems.map((item, index) => ({
    outfit_id: input.outfitId,
    clothing_item_id: item.id,
    position: index,
  }));

  const { error: insertItemsError } = await supabase.from('outfit_items').insert(outfitItemRows);

  if (insertItemsError) {
    throw insertItemsError;
  }

  const { error: deleteOccasionsError } = await supabase
    .from('outfit_occasions')
    .delete()
    .eq('outfit_id', input.outfitId);

  if (deleteOccasionsError) {
    throw deleteOccasionsError;
  }

  if (input.occasionIds && input.occasionIds.length > 0) {
    const occasionRows = input.occasionIds.map((occasionId) => ({
      outfit_id: input.outfitId,
      occasion_id: occasionId,
    }));

    const { error: insertOccasionsError } = await supabase
      .from('outfit_occasions')
      .insert(occasionRows);

    if (insertOccasionsError) {
      throw insertOccasionsError;
    }
  }

  const { error: deleteTagsError } = await supabase
    .from('outfit_tags')
    .delete()
    .eq('outfit_id', input.outfitId);

  if (deleteTagsError) {
    throw deleteTagsError;
  }

  if (input.tagIds && input.tagIds.length > 0) {
    const tagRows = input.tagIds.map((tagId) => ({
      outfit_id: input.outfitId,
      tag_id: tagId,
    }));

    const { error: insertTagsError } = await supabase.from('outfit_tags').insert(tagRows);

    if (insertTagsError) {
      throw insertTagsError;
    }
  }
}

export async function deleteOutfit(ownerId: string, outfitId: string) {
  const { data: outfit, error: outfitLookupError } = await supabase
    .from('outfits')
    .select('id')
    .eq('id', outfitId)
    .eq('owner_id', ownerId)
    .maybeSingle<{ id: string }>();

  if (outfitLookupError) {
    throw outfitLookupError;
  }

  if (!outfit) {
    throw new Error('Outfit not found.');
  }

  await cleanupOutfit(outfitId);
}
