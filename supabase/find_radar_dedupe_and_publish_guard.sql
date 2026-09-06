-- Find Radar v11: remove accidental duplicate reports and make publishing idempotent.
-- Run once in the same shared Opportunity Radar Supabase project.

-- 1) Remove accidental duplicates, keeping the oldest copy of an identical post.
with ranked as (
  select
    id,
    row_number() over (
      partition by
        user_id,
        type,
        title,
        category,
        coalesce(description, ''),
        date,
        coalesce(time, ''),
        lat,
        lng,
        coalesce(image_data_url, '')
      order by created_at asc, id asc
    ) as rn
  from public.find_radar_reports
)
delete from public.find_radar_reports r
using ranked d
where r.id = d.id
  and d.rn > 1;

-- 2) Add a per-form submission id. Repeated clicks/retries for the same form
--    resolve to one database row instead of creating clones.
alter table public.find_radar_reports
  add column if not exists client_submission_id uuid;

create unique index if not exists find_radar_reports_client_submission_id_unique
  on public.find_radar_reports (client_submission_id);

-- Upsert only ever updates the signed-in user's own report. This lets a network
-- retry safely resolve to the already-created row instead of making a clone.
drop policy if exists "Users can update own reports"
  on public.find_radar_reports;

create policy "Users can update own reports"
  on public.find_radar_reports
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
