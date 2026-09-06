-- FIND RADAR PRIVATE MESSAGING v10
-- Run once in the SAME Supabase project used by Opportunity Radar / Find Radar.

create table if not exists public.find_radar_conversations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.find_radar_reports(id) on delete set null,
  report_title text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  participant_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint find_radar_no_self_conversation check (owner_user_id <> participant_user_id)
);

create unique index if not exists find_radar_one_chat_per_report_user
  on public.find_radar_conversations(report_id, participant_user_id)
  where report_id is not null;

create table if not exists public.find_radar_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.find_radar_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1200),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists find_radar_messages_conversation_created_idx
  on public.find_radar_messages(conversation_id, created_at);

alter table public.find_radar_conversations enable row level security;
alter table public.find_radar_messages enable row level security;

drop policy if exists "Participants can view Find Radar conversations" on public.find_radar_conversations;
create policy "Participants can view Find Radar conversations"
on public.find_radar_conversations
for select
to authenticated
using (auth.uid() = owner_user_id or auth.uid() = participant_user_id);

drop policy if exists "Users can start Find Radar conversations" on public.find_radar_conversations;
create policy "Users can start Find Radar conversations"
on public.find_radar_conversations
for insert
to authenticated
with check (
  auth.uid() = participant_user_id
  and owner_user_id <> participant_user_id
  and exists (
    select 1
    from public.find_radar_reports r
    where r.id = report_id
      and r.user_id = owner_user_id
  )
);

drop policy if exists "Participants can update Find Radar conversations" on public.find_radar_conversations;
create policy "Participants can update Find Radar conversations"
on public.find_radar_conversations
for update
to authenticated
using (auth.uid() = owner_user_id or auth.uid() = participant_user_id)
with check (auth.uid() = owner_user_id or auth.uid() = participant_user_id);

drop policy if exists "Participants can read Find Radar messages" on public.find_radar_messages;
create policy "Participants can read Find Radar messages"
on public.find_radar_messages
for select
to authenticated
using (
  exists (
    select 1 from public.find_radar_conversations c
    where c.id = conversation_id
      and (auth.uid() = c.owner_user_id or auth.uid() = c.participant_user_id)
  )
);

drop policy if exists "Participants can send Find Radar messages" on public.find_radar_messages;
create policy "Participants can send Find Radar messages"
on public.find_radar_messages
for insert
to authenticated
with check (
  auth.uid() = sender_user_id
  and exists (
    select 1 from public.find_radar_conversations c
    where c.id = conversation_id
      and (auth.uid() = c.owner_user_id or auth.uid() = c.participant_user_id)
  )
);

drop policy if exists "Participants can mark Find Radar messages read" on public.find_radar_messages;
create policy "Participants can mark Find Radar messages read"
on public.find_radar_messages
for update
to authenticated
using (
  exists (
    select 1 from public.find_radar_conversations c
    where c.id = conversation_id
      and (auth.uid() = c.owner_user_id or auth.uid() = c.participant_user_id)
  )
)
with check (
  exists (
    select 1 from public.find_radar_conversations c
    where c.id = conversation_id
      and (auth.uid() = c.owner_user_id or auth.uid() = c.participant_user_id)
  )
);

create or replace function public.find_radar_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.find_radar_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists find_radar_touch_conversation_on_message on public.find_radar_messages;
create trigger find_radar_touch_conversation_on_message
after insert on public.find_radar_messages
for each row execute function public.find_radar_touch_conversation();
