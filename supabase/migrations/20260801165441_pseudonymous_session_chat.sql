create table if not exists public.pseudonymous_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_key text not null default 'temple-main',
  participant_id uuid not null references public.telegram_private_sessions(participant_id) on delete cascade,
  nickname_snapshot text not null,
  body text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint pseudonymous_chat_room_key_length check (char_length(room_key) between 1 and 64),
  constraint pseudonymous_chat_nickname_length check (char_length(nickname_snapshot) between 2 and 24),
  constraint pseudonymous_chat_body_length check (char_length(body) between 1 and 500)
);

create index if not exists pseudonymous_chat_room_created_idx
  on public.pseudonymous_chat_messages(room_key, created_at desc);

create index if not exists pseudonymous_chat_participant_created_idx
  on public.pseudonymous_chat_messages(participant_id, created_at desc);

alter table public.pseudonymous_chat_messages enable row level security;
alter table public.pseudonymous_chat_messages force row level security;

revoke all on public.pseudonymous_chat_messages from public, anon, authenticated;
grant all on public.pseudonymous_chat_messages to service_role;

drop policy if exists "deny direct client access to session chat" on public.pseudonymous_chat_messages;
create policy "deny direct client access to session chat"
  on public.pseudonymous_chat_messages
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.pseudonymous_chat_messages is
  'Ephemeral room chat exposed only through the server after private Telegram session validation.';
