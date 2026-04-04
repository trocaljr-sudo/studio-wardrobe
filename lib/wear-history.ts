import { supabase } from './supabase';
import { fetchEventDetail } from './events';
import { fetchOutfitDetail } from './outfits';

export type WearLogSource = 'manual' | 'event' | 'ai' | 'builder';

type WearLogRow = {
  clothing_item_id: string | null;
  created_at: string;
  event_id: number | null;
  id: string;
  notes: string | null;
  outfit_id: string | null;
  owner_id: string;
  source: WearLogSource;
  wear_session_id: string;
  worn_on: string;
};

export type WearHistorySnapshot = {
  available: boolean;
  itemLastWorn: Map<string, string>;
  itemWearCounts: Map<string, number>;
  logs: WearLogRow[];
  outfitLastWorn: Map<string, string>;
  outfitWearCounts: Map<string, number>;
};

function createSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildSnapshot(rows: WearLogRow[]): WearHistorySnapshot {
  const itemLastWorn = new Map<string, string>();
  const itemWearCounts = new Map<string, number>();
  const outfitLastWorn = new Map<string, string>();
  const outfitWearCounts = new Map<string, number>();
  const outfitSessions = new Map<string, Set<string>>();

  rows.forEach((row) => {
    if (row.clothing_item_id) {
      itemWearCounts.set(row.clothing_item_id, (itemWearCounts.get(row.clothing_item_id) ?? 0) + 1);

      if (!itemLastWorn.has(row.clothing_item_id)) {
        itemLastWorn.set(row.clothing_item_id, row.worn_on);
      }
    }

    if (row.outfit_id) {
      const sessions = outfitSessions.get(row.outfit_id) ?? new Set<string>();
      sessions.add(row.wear_session_id);
      outfitSessions.set(row.outfit_id, sessions);

      if (!outfitLastWorn.has(row.outfit_id)) {
        outfitLastWorn.set(row.outfit_id, row.worn_on);
      }
    }
  });

  outfitSessions.forEach((sessions, outfitId) => {
    outfitWearCounts.set(outfitId, sessions.size);
  });

  return {
    available: true,
    logs: rows,
    itemLastWorn,
    itemWearCounts,
    outfitLastWorn,
    outfitWearCounts,
  };
}

function emptySnapshot(): WearHistorySnapshot {
  return {
    available: false,
    logs: [],
    itemLastWorn: new Map(),
    itemWearCounts: new Map(),
    outfitLastWorn: new Map(),
    outfitWearCounts: new Map(),
  };
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  return candidate.code === '42P01' || candidate.message?.toLowerCase().includes('wear_logs') === true;
}

export async function fetchWearHistory(userId: string): Promise<WearHistorySnapshot> {
  const { data, error } = await supabase
    .from('wear_logs')
    .select(
      'id, wear_session_id, owner_id, outfit_id, clothing_item_id, event_id, source, worn_on, notes, created_at'
    )
    .eq('owner_id', userId)
    .order('worn_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) {
      return emptySnapshot();
    }

    throw error;
  }

  return buildSnapshot((data ?? []) as WearLogRow[]);
}

export async function recordOutfitWear(input: {
  eventId?: number | null;
  notes?: string | null;
  outfitId: string;
  source?: WearLogSource;
  userId: string;
  wornOn?: string;
}) {
  const detail = await fetchOutfitDetail(input.userId, input.outfitId);
  const sessionId = createSessionId();
  const wornOn = input.wornOn ?? new Date().toISOString().slice(0, 10);
  const source = input.source ?? 'manual';

  const rows = detail.items.map((item) => ({
    wear_session_id: sessionId,
    owner_id: input.userId,
    outfit_id: input.outfitId,
    clothing_item_id: item.id,
    event_id: input.eventId ?? null,
    source,
    worn_on: wornOn,
    notes: input.notes?.trim() ? input.notes.trim() : null,
  }));

  const { error } = await supabase.from('wear_logs').insert(rows);

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('Wear tracking is not available until the wear_logs migration is applied.');
    }

    throw error;
  }
}

export async function recordEventWear(input: {
  eventId: number;
  notes?: string | null;
  userId: string;
}) {
  const detail = await fetchEventDetail(input.userId, input.eventId);

  if (!detail.outfit?.id) {
    throw new Error('Assign an outfit to this event before marking it as worn.');
  }

  await recordOutfitWear({
    userId: input.userId,
    eventId: input.eventId,
    outfitId: detail.outfit.id,
    wornOn: detail.scheduledDate ?? new Date().toISOString().slice(0, 10),
    notes: input.notes ?? detail.notes ?? null,
    source: 'event',
  });
}
