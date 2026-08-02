drop index if exists public.realtime_participants_room_expiry_idx;

drop policy if exists "deny direct client access to realtime participants"
  on public.realtime_participants;
create policy "deny direct client access to realtime participants"
  on public.realtime_participants
  for all
  to anon, authenticated
  using (false)
  with check (false);
