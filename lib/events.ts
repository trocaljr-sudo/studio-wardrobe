import { supabase } from './supabase';
import { fetchOccasions, fetchOutfits, type Occasion, type OutfitSummary } from './outfits';

type EventPayload = {
  notes?: string | null;
  occasion_id?: string | null;
  outfit_id?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
};

type EventRow = {
  created_at: string | null;
  event_type: string;
  id: number;
  payload: EventPayload | null;
  user_id: string | null;
};

export type EventSummary = {
  created_at: string | null;
  id: number;
  isPast: boolean;
  notes: string | null;
  occasion: Occasion | null;
  outfit: OutfitSummary | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  title: string;
};

export type EventDetail = EventSummary;

function normalizePayload(payload: EventPayload | null | undefined): EventPayload {
  return {
    scheduled_date:
      typeof payload?.scheduled_date === 'string' ? payload.scheduled_date : null,
    scheduled_time:
      typeof payload?.scheduled_time === 'string' ? payload.scheduled_time : null,
    notes: typeof payload?.notes === 'string' ? payload.notes : null,
    occasion_id: typeof payload?.occasion_id === 'string' ? payload.occasion_id : null,
    outfit_id: typeof payload?.outfit_id === 'string' ? payload.outfit_id : null,
  };
}

function buildSortDate(date: string | null, time: string | null, mode: 'start' | 'end') {
  if (!date) {
    return null;
  }

  const safeTime = time
    ? `${time}:00`
    : mode === 'end'
      ? '23:59:59'
      : '00:00:00';
  const candidate = new Date(`${date}T${safeTime}`);

  if (Number.isNaN(candidate.getTime())) {
    return null;
  }

  return candidate;
}

function mapEventRow(
  row: EventRow,
  occasionMap: Map<string, Occasion>,
  outfitMap: Map<string, OutfitSummary>
) {
  const payload = normalizePayload(row.payload);
  const scheduledDate = payload.scheduled_date ?? null;
  const scheduledTime = payload.scheduled_time ?? null;
  const endDate = buildSortDate(scheduledDate, scheduledTime, 'end');

  return {
    id: row.id,
    title: row.event_type,
    created_at: row.created_at,
    scheduledDate,
    scheduledTime,
    notes: payload.notes ?? null,
    occasion: payload.occasion_id ? occasionMap.get(payload.occasion_id) ?? null : null,
    outfit: payload.outfit_id ? outfitMap.get(payload.outfit_id) ?? null : null,
    isPast: endDate ? endDate.getTime() < Date.now() : false,
  } as EventSummary;
}

function sortEvents(events: EventSummary[]) {
  return [...events].sort((left, right) => {
    const leftStart = buildSortDate(left.scheduledDate, left.scheduledTime, 'start');
    const rightStart = buildSortDate(right.scheduledDate, right.scheduledTime, 'start');

    if (!left.isPast && right.isPast) {
      return -1;
    }

    if (left.isPast && !right.isPast) {
      return 1;
    }

    if (leftStart && rightStart) {
      return left.isPast
        ? rightStart.getTime() - leftStart.getTime()
        : leftStart.getTime() - rightStart.getTime();
    }

    if (leftStart) {
      return -1;
    }

    if (rightStart) {
      return 1;
    }

    return (right.created_at ?? '').localeCompare(left.created_at ?? '');
  });
}

async function ensureOwnedOutfit(userId: string, outfitId: string | null | undefined) {
  if (!outfitId) {
    return;
  }

  const { data, error } = await supabase
    .from('outfits')
    .select('id')
    .eq('id', outfitId)
    .eq('owner_id', userId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Selected outfit is no longer available.');
  }
}

export async function fetchEvents(userId: string) {
  const [{ data, error }, occasions, outfits] = await Promise.all([
    supabase
      .from('events')
      .select('id, user_id, event_type, payload, created_at')
      .eq('user_id', userId),
    fetchOccasions(),
    fetchOutfits(userId),
  ]);

  if (error) {
    throw error;
  }

  const occasionMap = new Map(occasions.map((occasion) => [occasion.id, occasion]));
  const outfitMap = new Map(outfits.map((outfit) => [outfit.id, outfit]));

  return sortEvents(
    ((data ?? []) as EventRow[]).map((row) => mapEventRow(row, occasionMap, outfitMap))
  );
}

export async function fetchEventDetail(userId: string, eventId: number) {
  const [{ data, error }, occasions, outfits] = await Promise.all([
    supabase
      .from('events')
      .select('id, user_id, event_type, payload, created_at')
      .eq('id', eventId)
      .eq('user_id', userId)
      .maybeSingle<EventRow>(),
    fetchOccasions(),
    fetchOutfits(userId),
  ]);

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Event not found.');
  }

  const occasionMap = new Map(occasions.map((occasion) => [occasion.id, occasion]));
  const outfitMap = new Map(outfits.map((outfit) => [outfit.id, outfit]));

  return mapEventRow(data, occasionMap, outfitMap);
}

export async function createEvent(input: {
  notes?: string;
  occasionId?: string | null;
  outfitId?: string | null;
  scheduledDate: string;
  scheduledTime?: string;
  title: string;
  userId: string;
}) {
  await ensureOwnedOutfit(input.userId, input.outfitId);

  const payload = {
    scheduled_date: input.scheduledDate.trim(),
    scheduled_time: input.scheduledTime?.trim() ? input.scheduledTime.trim() : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    occasion_id: input.occasionId ?? null,
    outfit_id: input.outfitId ?? null,
  };

  const { data, error } = await supabase
    .from('events')
    .insert({
      user_id: input.userId,
      event_type: input.title.trim(),
      payload,
    })
    .select('id, user_id, event_type, payload, created_at')
    .single<EventRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateEvent(input: {
  eventId: number;
  notes?: string;
  occasionId?: string | null;
  outfitId?: string | null;
  scheduledDate: string;
  scheduledTime?: string;
  title: string;
  userId: string;
}) {
  await ensureOwnedOutfit(input.userId, input.outfitId);

  const payload = {
    scheduled_date: input.scheduledDate.trim(),
    scheduled_time: input.scheduledTime?.trim() ? input.scheduledTime.trim() : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    occasion_id: input.occasionId ?? null,
    outfit_id: input.outfitId ?? null,
  };

  const { error } = await supabase
    .from('events')
    .update({
      event_type: input.title.trim(),
      payload,
    })
    .eq('id', input.eventId)
    .eq('user_id', input.userId);

  if (error) {
    throw error;
  }
}

export async function deleteEvent(userId: string, eventId: number) {
  const { data, error: lookupError } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle<{ id: number }>();

  if (lookupError) {
    throw lookupError;
  }

  if (!data) {
    throw new Error('Event not found.');
  }

  const { error } = await supabase.from('events').delete().eq('id', eventId).eq('user_id', userId);

  if (error) {
    throw error;
  }
}
