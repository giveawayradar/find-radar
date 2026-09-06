create table if not exists public.find_radar_restock_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  source text not null,
  image text,
  variant text,
  target_price numeric,
  currency text not null default 'PLN',
  status text not null default 'unknown' check (status in ('in_stock','out_of_stock','unknown')),
  previous_status text check (previous_status in ('in_stock','out_of_stock','unknown')),
  current_price numeric,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, url, variant)
);

alter table public.find_radar_restock_watches enable row level security;

drop policy if exists "Users can view own restock watches" on public.find_radar_restock_watches;
create policy "Users can view own restock watches"
on public.find_radar_restock_watches for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own restock watches" on public.find_radar_restock_watches;
create policy "Users can create own restock watches"
on public.find_radar_restock_watches for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own restock watches" on public.find_radar_restock_watches;
create policy "Users can update own restock watches"
on public.find_radar_restock_watches for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own restock watches" on public.find_radar_restock_watches;
create policy "Users can delete own restock watches"
on public.find_radar_restock_watches for delete to authenticated
using (auth.uid() = user_id);
