create table public.testnet_gram_claim_challenges (
  id uuid primary key default gen_random_uuid(),
  subject_hash text not null,
  wallet_address text not null,
  wallet_network text not null default '-3',
  challenge_text text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint testnet_gram_claim_challenges_subject_hash check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint testnet_gram_claim_challenges_wallet_address check (char_length(wallet_address) between 10 and 160),
  constraint testnet_gram_claim_challenges_network check (wallet_network = '-3'),
  constraint testnet_gram_claim_challenges_text_length check (char_length(challenge_text) between 32 and 2000)
);

create table public.testnet_gram_claims (
  id uuid primary key default gen_random_uuid(),
  subject_hash text not null unique,
  wallet_address text not null unique,
  wallet_network text not null default '-3',
  amount_raw numeric(78, 0) not null,
  status text not null default 'pending',
  external_message_hash text,
  valid_until timestamptz,
  confirmed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testnet_gram_claims_subject_hash check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint testnet_gram_claims_wallet_address check (char_length(wallet_address) between 10 and 160),
  constraint testnet_gram_claims_network check (wallet_network = '-3'),
  constraint testnet_gram_claims_amount check (amount_raw = 100000000000),
  constraint testnet_gram_claims_status check (status in ('pending', 'submitted', 'confirmed', 'failed')),
  constraint testnet_gram_claims_message_hash check (
    external_message_hash is null or external_message_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint testnet_gram_claims_error_length check (last_error is null or char_length(last_error) <= 500)
);

create index testnet_gram_claim_challenges_subject_created_idx
  on public.testnet_gram_claim_challenges(subject_hash, created_at desc);
create index testnet_gram_claims_status_updated_idx
  on public.testnet_gram_claims(status, updated_at);

alter table public.testnet_gram_claim_challenges enable row level security;
alter table public.testnet_gram_claim_challenges force row level security;
alter table public.testnet_gram_claims enable row level security;
alter table public.testnet_gram_claims force row level security;

revoke all on public.testnet_gram_claim_challenges from public, anon, authenticated;
revoke all on public.testnet_gram_claims from public, anon, authenticated;
grant select, insert, update on public.testnet_gram_claim_challenges to service_role;
grant select, insert, update on public.testnet_gram_claims to service_role;

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
  if p_amount_raw <> 100000000000 then
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
