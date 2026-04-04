create extension if not exists pgcrypto;

create table if not exists public.wear_logs (
  id uuid primary key default gen_random_uuid(),
  wear_session_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  outfit_id uuid null references public.outfits (id) on delete set null,
  clothing_item_id uuid null references public.clothing_items (id) on delete cascade,
  event_id bigint null references public.events (id) on delete set null,
  source text not null check (source in ('manual', 'event', 'ai', 'builder')),
  worn_on date not null default current_date,
  notes text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists wear_logs_owner_id_idx on public.wear_logs (owner_id, worn_on desc);
create index if not exists wear_logs_outfit_id_idx on public.wear_logs (outfit_id);
create index if not exists wear_logs_clothing_item_id_idx on public.wear_logs (clothing_item_id);
create index if not exists wear_logs_event_id_idx on public.wear_logs (event_id);
create index if not exists wear_logs_session_id_idx on public.wear_logs (wear_session_id);

alter table public.wear_logs enable row level security;

drop policy if exists "Users can view their own wear logs" on public.wear_logs;
create policy "Users can view their own wear logs"
on public.wear_logs
for select
using (auth.uid() = owner_id);

drop policy if exists "Users can insert their own wear logs" on public.wear_logs;
create policy "Users can insert their own wear logs"
on public.wear_logs
for insert
with check (auth.uid() = owner_id);

drop policy if exists "Users can delete their own wear logs" on public.wear_logs;
create policy "Users can delete their own wear logs"
on public.wear_logs
for delete
using (auth.uid() = owner_id);
