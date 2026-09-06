create extension if not exists pgcrypto;
create table if not exists public.find_radar_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  type text not null check (type in ('lost','found')),
  title text not null check (char_length(title) between 1 and 140),
  category text not null,
  description text not null default '',
  date date not null,
  time time,
  contact text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  image_data_url text,
  created_at timestamptz not null default now()
);
alter table public.find_radar_reports enable row level security;
drop policy if exists "find radar reports are public" on public.find_radar_reports;
create policy "find radar reports are public" on public.find_radar_reports for select using (true);
drop policy if exists "signed in users create own find radar reports" on public.find_radar_reports;
create policy "signed in users create own find radar reports" on public.find_radar_reports for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users delete own find radar reports" on public.find_radar_reports;
create policy "users delete own find radar reports" on public.find_radar_reports for delete to authenticated using (auth.uid() = user_id);
create index if not exists find_radar_reports_created_at_idx on public.find_radar_reports(created_at desc);
create index if not exists find_radar_reports_user_id_idx on public.find_radar_reports(user_id);
