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
