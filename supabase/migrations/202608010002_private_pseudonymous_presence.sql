create extension if not exists pgcrypto;

drop table if exists public.telegram_profiles;

create table if not exists public.telegram_private_sessions (
  id uuid primary key default gen_random_uuid(),
  subject_hash text not null unique,
  token_hash text not null unique,
  participant_id uuid not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint telegram_private_sessions_subject_hash_length check (char_length(subject_hash) = 64),
  constraint telegram_private_sessions_token_hash_length check (char_length(token_hash) = 64)
);

create table if not exists public.pseudonymous_presence (
  participant_id uuid primary key references public.telegram_private_sessions(participant_id) on delete cascade,
  room_key text not null default 'temple-main',
  nickname text not null,
  avatar_id text not null,
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  position_z double precision not null default 0,
  rotation_y double precision not null default 0,
  animation text not null default 'idle',
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint pseudonymous_presence_nickname_length check (char_length(nickname) between 2 and 24),
  constraint pseudonymous_presence_room_key_length check (char_length(room_key) between 1 and 64)
);

create index if not exists pseudonymous_presence_room_active_idx
  on public.pseudonymous_presence(room_key, last_seen_at desc);

alter table public.telegram_private_sessions enable row level security;
alter table public.telegram_private_sessions force row level security;
alter table public.pseudonymous_presence enable row level security;
alter table public.pseudonymous_presence force row level security;

revoke all on public.telegram_private_sessions from public, anon, authenticated;
revoke all on public.pseudonymous_presence from public, anon, authenticated;
grant all on public.telegram_private_sessions to service_role;
grant all on public.pseudonymous_presence to service_role;

-- There are intentionally no anon/authenticated policies. Participants read the
-- pseudonymous room through the server after presenting their private token.

create or replace function public.create_private_telegram_session(
  p_subject_hash text,
  p_token_hash text,
  p_participant_id uuid,
  p_nickname text,
  p_avatar_id text,
  p_expires_at timestamptz
)
returns table (
  participant_id uuid,
  nickname text,
  avatar_id text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_participant_id uuid;
begin
  delete from public.telegram_private_sessions as sessions
  where sessions.expires_at <= now() or sessions.revoked_at is not null;

  select sessions.participant_id
    into previous_participant_id
    from public.telegram_private_sessions as sessions
    where sessions.subject_hash = p_subject_hash
    for update;

  if previous_participant_id is not null then
    delete from public.telegram_private_sessions as sessions
    where sessions.subject_hash = p_subject_hash;
  end if;

  insert into public.telegram_private_sessions (
    subject_hash,
    token_hash,
    participant_id,
    expires_at
  ) values (
    p_subject_hash,
    p_token_hash,
    p_participant_id,
    p_expires_at
  );

  insert into public.pseudonymous_presence (
    participant_id,
    nickname,
    avatar_id,
    expires_at
  ) values (
    p_participant_id,
    p_nickname,
    p_avatar_id,
    p_expires_at
  );

  return query
  select presence.participant_id, presence.nickname, presence.avatar_id, presence.expires_at
  from public.pseudonymous_presence as presence
  where presence.participant_id = p_participant_id;
end;
$$;

revoke all on function public.create_private_telegram_session(text, text, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_private_telegram_session(text, text, uuid, text, text, timestamptz)
  to service_role;

do $$
begin
  alter publication supabase_realtime add table public.pseudonymous_presence;
exception
  when duplicate_object then null;
end $$;
