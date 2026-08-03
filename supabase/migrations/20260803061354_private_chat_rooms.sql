create table if not exists public.pseudonymous_chat_rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  name text not null,
  password_salt text not null,
  password_hash text not null,
  creator_participant_id uuid not null references public.telegram_private_sessions(participant_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint pseudonymous_chat_rooms_invite_code check (
    char_length(invite_code) = 8 and invite_code ~ '^[A-Z2-9]+$'
  ),
  constraint pseudonymous_chat_rooms_name_length check (char_length(name) between 2 and 32),
  constraint pseudonymous_chat_rooms_password_salt_length check (char_length(password_salt) = 32),
  constraint pseudonymous_chat_rooms_password_hash_length check (char_length(password_hash) = 128),
  constraint pseudonymous_chat_rooms_expiry check (expires_at > created_at)
);

create table if not exists public.pseudonymous_chat_room_members (
  room_id uuid not null references public.pseudonymous_chat_rooms(id) on delete cascade,
  participant_id uuid not null references public.telegram_private_sessions(participant_id) on delete cascade,
  joined_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (room_id, participant_id),
  constraint pseudonymous_chat_room_members_expiry check (expires_at > joined_at)
);

create index if not exists pseudonymous_chat_rooms_expiry_idx
  on public.pseudonymous_chat_rooms(expires_at);

create index if not exists pseudonymous_chat_room_members_participant_idx
  on public.pseudonymous_chat_room_members(participant_id, expires_at desc);

alter table public.pseudonymous_chat_rooms enable row level security;
alter table public.pseudonymous_chat_rooms force row level security;
alter table public.pseudonymous_chat_room_members enable row level security;
alter table public.pseudonymous_chat_room_members force row level security;

revoke all on public.pseudonymous_chat_rooms from public, anon, authenticated;
revoke all on public.pseudonymous_chat_room_members from public, anon, authenticated;
grant all on public.pseudonymous_chat_rooms to service_role;
grant all on public.pseudonymous_chat_room_members to service_role;

drop policy if exists "deny direct client access to private chat rooms" on public.pseudonymous_chat_rooms;
create policy "deny direct client access to private chat rooms"
  on public.pseudonymous_chat_rooms
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "deny direct client access to private room memberships" on public.pseudonymous_chat_room_members;
create policy "deny direct client access to private room memberships"
  on public.pseudonymous_chat_room_members
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.pseudonymous_chat_rooms is
  'Ephemeral password-protected pseudonymous rooms available only through the server API.';

comment on table public.pseudonymous_chat_room_members is
  'Ephemeral private-room memberships bound to validated Telegram private sessions.';
