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
};

export type Category = {
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
};

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

export async function fetchWardrobeItems(userId: string) {
  await ensureActiveWardrobe(userId);

  const { data, error } = await supabase
    .from('clothing_items')
    .select('id, name, color, created_at, wardrobe_id, owner_id, image_path')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const clothingItems = (data ?? []) as ClothingItemRow[];
  const imageUrlMap = new Map<string, string | null>();

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
    })) as ClothingItem[],
  };
}

export async function createClothingItem(input: {
  categoryId?: string | null;
  color?: string;
  imageUri?: string | null;
  mimeType?: string | null;
  name: string;
  ownerId: string;
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
    image_path: uploadedImagePath,
  };

  const { data: clothingItem, error } = await supabase
    .from('clothing_items')
    .insert(payload)
    .select('id, name, color, created_at, wardrobe_id, owner_id, image_path')
    .single<ClothingItemRow>();

  if (error) {
    if (uploadedImagePath) {
      await supabase.storage.from(supabaseImagesBucket).remove([uploadedImagePath]);
    }
    throw error;
  }

  return {
    ...clothingItem,
    imageUrl: null,
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
