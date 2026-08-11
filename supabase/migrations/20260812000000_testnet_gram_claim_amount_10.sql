alter table public.testnet_gram_claims
  drop constraint if exists testnet_gram_claims_amount;

alter table public.testnet_gram_claims
  add constraint testnet_gram_claims_amount check (amount_raw = 10000000000);

create or replace function public.reserve_testnet_gram_claim(
  p_challenge_id uuid,
  p_subject_hash text,
  p_wallet_address text,
  p_amount_raw numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  challenge_row public.testnet_gram_claim_challenges%rowtype;
  claim_row public.testnet_gram_claims%rowtype;
begin
  select * into challenge_row
  from public.testnet_gram_claim_challenges
  where id = p_challenge_id
  for update;

  if challenge_row.id is null
    or challenge_row.consumed_at is not null
    or challenge_row.expires_at <= now() then
    raise exception 'TESTNET_GRAM_CHALLENGE_EXPIRED';
  end if;
  if challenge_row.subject_hash <> p_subject_hash
    or challenge_row.wallet_address <> p_wallet_address
    or challenge_row.wallet_network <> '-3' then
    raise exception 'TESTNET_GRAM_CHALLENGE_MISMATCH';
  end if;
  if p_amount_raw <> 10000000000 then
    raise exception 'TESTNET_GRAM_AMOUNT_INVALID';
  end if;

  select * into claim_row
  from public.testnet_gram_claims
  where subject_hash = p_subject_hash or wallet_address = p_wallet_address
  for update;

  if claim_row.id is not null
    and (claim_row.subject_hash <> p_subject_hash or claim_row.wallet_address <> p_wallet_address) then
    raise exception 'TESTNET_GRAM_ALREADY_CLAIMED';
  end if;

  update public.testnet_gram_claim_challenges
  set consumed_at = now()
  where id = challenge_row.id;

  if claim_row.id is null then
    insert into public.testnet_gram_claims (
      subject_hash,
      wallet_address,
      wallet_network,
      amount_raw,
      status
    ) values (
      p_subject_hash,
      p_wallet_address,
      '-3',
      p_amount_raw,
      'pending'
    ) returning * into claim_row;
  elsif claim_row.status = 'failed' then
    update public.testnet_gram_claims
    set status = 'pending', last_error = null, updated_at = now()
    where id = claim_row.id
    returning * into claim_row;
  end if;

  return jsonb_build_object(
    'id', claim_row.id,
    'status', claim_row.status,
    'wallet_address', claim_row.wallet_address,
    'amount_raw', claim_row.amount_raw::text
  );
end;
$$;

revoke all on function public.reserve_testnet_gram_claim(uuid, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.reserve_testnet_gram_claim(uuid, text, text, numeric)
  to service_role;
