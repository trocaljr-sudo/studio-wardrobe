import { supabase } from './supabase';

export type ClothingItem = {
  id: string;
  name: string;
  color: string | null;
  created_at: string | null;
  wardrobe_id: string;
  owner_id: string;
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
  const wardrobeId = await ensureActiveWardrobe(userId);

  const { data, error } = await supabase
    .from('clothing_items')
    .select('id, name, color, created_at, wardrobe_id, owner_id')
    .eq('owner_id', userId)
    .eq('wardrobe_id', wardrobeId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return {
    items: (data ?? []) as ClothingItem[],
    wardrobeId,
  };
}

export async function createClothingItem(input: {
  color?: string;
  name: string;
  userId: string;
}) {
  const wardrobeId = await ensureActiveWardrobe(input.userId);

  const payload = {
    owner_id: input.userId,
    wardrobe_id: wardrobeId,
    name: input.name,
    color: input.color?.trim() ? input.color.trim() : null,
  };

  const { data, error } = await supabase
    .from('clothing_items')
    .insert(payload)
    .select('id, name, color, created_at, wardrobe_id, owner_id')
    .single<ClothingItem>();

  if (error) {
    throw error;
  }

  return data;
}
