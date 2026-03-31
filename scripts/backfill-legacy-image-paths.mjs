import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const projectRoot = path.resolve(process.cwd());
const appConfigPath = path.join(projectRoot, 'app.json');

function readAppConfig() {
  const raw = fs.readFileSync(appConfigPath, 'utf8');
  const parsed = JSON.parse(raw);
  const extra = parsed?.expo?.extra ?? {};

  if (!extra.supabaseUrl || !extra.supabaseAnonKey) {
    throw new Error('Missing Supabase config in app.json extra.');
  }

  return {
    supabaseUrl: extra.supabaseUrl,
    supabaseAnonKey: extra.supabaseAnonKey,
    supabaseImagesBucket: extra.supabaseImagesBucket ?? 'images',
  };
}

function getSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = readAppConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || supabaseAnonKey;

  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function pickLegacyImage(item, images) {
  if (images.length === 0) {
    return null;
  }

  if (item.primary_image_id) {
    const explicitPrimary = images.find((image) => image.id === item.primary_image_id);
    if (explicitPrimary) {
      return explicitPrimary;
    }
  }

  const flaggedPrimary = images.find((image) => image.is_primary);
  if (flaggedPrimary) {
    return flaggedPrimary;
  }

  return [...images].sort((left, right) => {
    const leftTimestamp = left.uploaded_at ? Date.parse(left.uploaded_at) : 0;
    const rightTimestamp = right.uploaded_at ? Date.parse(right.uploaded_at) : 0;
    return rightTimestamp - leftTimestamp;
  })[0];
}

async function main() {
  const { supabaseImagesBucket } = readAppConfig();
  const supabase = getSupabaseClient();

  const { data: items, error: itemsError } = await supabase
    .from('clothing_items')
    .select('id, owner_id, image_path, primary_image_id')
    .is('image_path', null)
    .order('created_at', { ascending: false });

  if (itemsError) {
    throw itemsError;
  }

  const pendingItems = items ?? [];
  if (pendingItems.length === 0) {
    console.log('No clothing items need image_path backfill.');
    return;
  }

  const itemIds = pendingItems.map((item) => item.id);
  const { data: images, error: imagesError } = await supabase
    .from('images')
    .select('id, clothing_item_id, bucket_id, path, is_primary, uploaded_at')
    .in('clothing_item_id', itemIds)
    .not('path', 'is', null)
    .order('is_primary', { ascending: false })
    .order('uploaded_at', { ascending: false });

  if (imagesError) {
    throw imagesError;
  }

  const imagesByItemId = new Map();
  (images ?? []).forEach((image) => {
    const key = image.clothing_item_id;
    if (!key) {
      return;
    }

    const existing = imagesByItemId.get(key) ?? [];
    existing.push(image);
    imagesByItemId.set(key, existing);
  });

  const updates = [];
  const skipped = [];

  pendingItems.forEach((item) => {
    const legacyImage = pickLegacyImage(item, imagesByItemId.get(item.id) ?? []);

    if (!legacyImage?.path) {
      skipped.push({ itemId: item.id, reason: 'no_legacy_image' });
      return;
    }

    if (legacyImage.bucket_id && legacyImage.bucket_id !== supabaseImagesBucket) {
      skipped.push({
        itemId: item.id,
        reason: `bucket_mismatch:${legacyImage.bucket_id}`,
      });
      return;
    }

    updates.push({
      id: item.id,
      image_path: legacyImage.path,
    });
  });

  if (updates.length === 0) {
    console.log(
      JSON.stringify(
        {
          updated: 0,
          skipped,
        },
        null,
        2
      )
    );
    return;
  }

  const { error: updateError } = await supabase.from('clothing_items').upsert(updates, {
    onConflict: 'id',
  });

  if (updateError) {
    throw updateError;
  }

  console.log(
    JSON.stringify(
      {
        updated: updates.length,
        skipped,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
