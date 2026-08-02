create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.realtime_participants (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  participant_id uuid not null unique references public.telegram_private_sessions(participant_id) on delete cascade,
  room_key text not null default 'temple-main',
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint realtime_participants_room_key_length check (char_length(room_key) between 1 and 64)
);

create index if not exists realtime_participants_room_expiry_idx
  on public.realtime_participants(room_key, expires_at);

alter table public.realtime_participants enable row level security;
alter table public.realtime_participants force row level security;
revoke all on public.realtime_participants from public, anon, authenticated;
grant all on public.realtime_participants to service_role;

create or replace function private.can_access_realtime_room(p_room_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.realtime_participants as member
    join public.telegram_private_sessions as session
      on session.participant_id = member.participant_id
    where member.auth_user_id = (select auth.uid())
      and member.room_key = p_room_key
      and member.expires_at > now()
      and session.expires_at > now()
      and session.revoked_at is null
  );
$$;

revoke all on function private.can_access_realtime_room(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_access_realtime_room(text) to authenticated;

drop policy if exists "temple participants can receive avatar motion" on realtime.messages;
create policy "temple participants can receive avatar motion"
  on realtime.messages
  for select
  to authenticated
  using (
    (select realtime.topic()) = 'room:temple-main:avatar-motion'
    and realtime.messages.extension = 'broadcast'
    and (select private.can_access_realtime_room('temple-main'))
  );

drop policy if exists "temple participants can send avatar motion" on realtime.messages;
create policy "temple participants can send avatar motion"
  on realtime.messages
  for insert
  to authenticated
  with check (
    (select realtime.topic()) = 'room:temple-main:avatar-motion'
    and realtime.messages.extension = 'broadcast'
    and (select private.can_access_realtime_room('temple-main'))
  );