drop policy if exists "deny client access to private sessions" on public.telegram_private_sessions;
create policy "deny client access to private sessions"
  on public.telegram_private_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "deny direct client access to presence" on public.pseudonymous_presence;
create policy "deny direct client access to presence"
  on public.pseudonymous_presence
  for all
  to anon, authenticated
  using (false)
  with check (false);
