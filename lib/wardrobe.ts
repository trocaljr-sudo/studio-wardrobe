import { supabase, supabaseImagesBucket } from './supabase';

export type ClothingItem = {
  id: string;
  name: string;
  color: string | null;
  created_at: string | null;
  wardrobe_id: string;
  owner_id: string;
  image_path: string | null;
  imageUrl: string | null;
  size: string | null;
  material: string | null;
  category_id: string | null;
  brand_id: string | null;
  categoryName: string | null;
  brandName: string | null;
  tagIds: string[];
  tagNames: string[];
};

export type Category = {
  id: string;
  name: string;
};

export type Brand = {
  id: string;
  name: string;
};

export type Tag = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  active_wardrobe_id: string | null;
};

type WardrobeRow = {
  id: string;
  owner_id: string;
  name: string;
  visibility: string;
};

type ClothingItemRow = {
  id: string;
  name: string;
  color: string | null;
  created_at: string | null;
  wardrobe_id: string;
  owner_id: string;
  image_path: string | null;
  size: string | null;
  material: string | null;
  category_id: string | null;
  brand_id: string | null;
  categories: { id: string; name: string }[] | null;
  brands: { id: string; name: string }[] | null;
};

function getFirstRelationName(
  relation: { id: string; name: string }[] | null | undefined
) {
  return relation?.[0]?.name ?? null;
}

function buildImagePath(userId: string, localUri: string, mimeType?: string | null) {
  const uriExtension = localUri.split('.').pop()?.toLowerCase();
  const mimeExtension = mimeType?.split('/').pop()?.toLowerCase();
  const extension = uriExtension || mimeExtension || 'jpg';

  return `${userId}/${Date.now()}.${extension}`;
}

async function upsertProfile(userId: string) {
  const { error } = await supabase.from('profiles').upsert({ id: userId });

  if (error) {
    throw error;
  }
}

async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, active_wardrobe_id')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function getOrCreateWardrobe(userId: string) {
  const { data: existingWardrobe, error: wardrobeLookupError } = await supabase
    .from('wardrobes')
    .select('id, owner_id, name, visibility')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<WardrobeRow>();

  if (wardrobeLookupError) {
    throw wardrobeLookupError;
  }

  if (existingWardrobe) {
    return existingWardrobe.id;
  }

  const { data: newWardrobe, error: createWardrobeError } = await supabase
    .from('wardrobes')
    .insert({
      owner_id: userId,
      name: 'My Wardrobe',
      visibility: 'private',
    })
    .select('id, owner_id, name, visibility')
    .single<WardrobeRow>();

  if (createWardrobeError) {
    throw createWardrobeError;
  }

  return newWardrobe.id;
}

export async function ensureActiveWardrobe(userId: string) {
  await upsertProfile(userId);

  const profile = await getProfile(userId);
  if (profile?.active_wardrobe_id) {
    return profile.active_wardrobe_id;
  }

  const wardrobeId = await getOrCreateWardrobe(userId);
  const { error: updateProfileError } = await supabase
    .from('profiles')
    .update({ active_wardrobe_id: wardrobeId })
    .eq('id', userId);

  if (updateProfileError) {
    throw updateProfileError;
  }

  return wardrobeId;
}

export async function fetchWardrobeItems(userId: string, categoryId?: string | null) {
  await ensureActiveWardrobe(userId);

  let query = supabase
    .from('clothing_items')
    .select(
      'id, name, color, created_at, wardrobe_id, owner_id, image_path, size, material, category_id, brand_id, categories(id, name), brands(id, name)'
    )
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const clothingItems = (data ?? []) as ClothingItemRow[];
  const imageUrlMap = new Map<string, string | null>();
  const itemIds = clothingItems.map((item) => item.id);
  const tagMap = new Map<string, { ids: string[]; names: string[] }>();

  if (itemIds.length > 0) {
    const { data: itemTags, error: itemTagsError } = await supabase
      .from('clothing_item_tags')
      .select('clothing_item_id, tags(id, name)')
      .in('clothing_item_id', itemIds);

    if (itemTagsError) {
      throw itemTagsError;
    }

    (itemTags ?? []).forEach((row: any) => {
      const clothingItemId = row.clothing_item_id as string;
      const tag = row.tags?.[0];
      if (!clothingItemId || !tag) {
        return;
      }

      const existing = tagMap.get(clothingItemId) ?? { ids: [], names: [] };
      existing.ids.push(tag.id);
      existing.names.push(tag.name);
      tagMap.set(clothingItemId, existing);
    });
  }

  await Promise.all(
    clothingItems.map(async (item) => {
      if (!item.image_path) {
        imageUrlMap.set(item.id, null);
        return;
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(supabaseImagesBucket)
        .createSignedUrl(item.image_path, 60 * 60);

      if (signedUrlError) {
        imageUrlMap.set(item.id, null);
        return;
      }

      imageUrlMap.set(item.id, signedUrlData.signedUrl);
    })
  );

  return {
    items: clothingItems.map((item) => ({
      ...item,
      imageUrl: imageUrlMap.get(item.id) ?? null,
      categoryName: getFirstRelationName(item.categories),
      brandName: getFirstRelationName(item.brands),
      tagIds: tagMap.get(item.id)?.ids ?? [],
      tagNames: tagMap.get(item.id)?.names ?? [],
    })) as ClothingItem[],
  };
}

export async function createClothingItem(input: {
  brandId?: string | null;
  categoryId?: string | null;
  color?: string;
  imageUri?: string | null;
  material?: string;
  mimeType?: string | null;
  name: string;
  ownerId: string;
  size?: string;
  tagIds?: string[];
}) {
  const wardrobeId = await ensureActiveWardrobe(input.ownerId);
  let uploadedImagePath: string | null = null;

  if (input.imageUri) {
    const imageResponse = await fetch(input.imageUri);
    const imageBuffer = await imageResponse.arrayBuffer();
    uploadedImagePath = buildImagePath(input.ownerId, input.imageUri, input.mimeType);

    const { error: uploadError } = await supabase.storage
      .from(supabaseImagesBucket)
      .upload(uploadedImagePath, imageBuffer, {
        contentType: input.mimeType ?? 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }
  }

  const payload = {
    owner_id: input.ownerId,
    wardrobe_id: wardrobeId,
    name: input.name,
    color: input.color?.trim() ? input.color.trim() : null,
    category_id: input.categoryId ?? null,
    brand_id: input.brandId ?? null,
    size: input.size?.trim() ? input.size.trim() : null,
    material: input.material?.trim() ? input.material.trim() : null,
    image_path: uploadedImagePath,
  };

  const { data: clothingItem, error } = await supabase
    .from('clothing_items')
    .insert(payload)
    .select(
      'id, name, color, created_at, wardrobe_id, owner_id, image_path, size, material, category_id, brand_id, categories(id, name), brands(id, name)'
    )
    .single<ClothingItemRow>();

  if (error) {
    if (uploadedImagePath) {
      await supabase.storage.from(supabaseImagesBucket).remove([uploadedImagePath]);
    }
    throw error;
  }

  if (input.tagIds && input.tagIds.length > 0) {
    const tagRows = input.tagIds.map((tagId) => ({
      clothing_item_id: clothingItem.id,
      tag_id: tagId,
    }));

    const { error: tagInsertError } = await supabase.from('clothing_item_tags').insert(tagRows);

    if (tagInsertError) {
      await supabase.from('clothing_items').delete().eq('id', clothingItem.id);

      if (uploadedImagePath) {
        await supabase.storage.from(supabaseImagesBucket).remove([uploadedImagePath]);
      }

      throw tagInsertError;
    }
  }

  return {
    ...clothingItem,
    imageUrl: null,
    categoryName: getFirstRelationName(clothingItem.categories),
    brandName: getFirstRelationName(clothingItem.brands),
    tagIds: input.tagIds ?? [],
    tagNames: [],
  } as ClothingItem;
}

export async function fetchCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Category[];
}

export async function fetchBrands() {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Brand[];
}

export async function fetchTags() {
  const { data, error } = await supabase.from('tags').select('id, name').order('name');

  if (error) {
    throw error;
  }

  return (data ?? []) as Tag[];
}
