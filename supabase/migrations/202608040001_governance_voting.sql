create extension if not exists pgcrypto;

create table if not exists public.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  options jsonb not null,
  quorum integer not null default 1,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  closes_at timestamptz not null,
  closed_at timestamptz,
  constraint governance_proposals_title_length check (char_length(title) between 3 and 120),
  constraint governance_proposals_description_length check (char_length(description) <= 2000),
  constraint governance_proposals_options_array check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  ),
  constraint governance_proposals_quorum_positive check (quorum between 1 and 1000000),
  constraint governance_proposals_status check (status in ('open', 'closed', 'cancelled')),
  constraint governance_proposals_closes_after_creation check (closes_at > created_at)
);

create table if not exists public.governance_vote_challenges (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.governance_proposals(id) on delete cascade,
  voter_key text not null,
  choice text not null,
  wallet_address text not null,
  wallet_network text not null,
  challenge_text text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint governance_vote_challenges_voter_key_length check (char_length(voter_key) = 64),
  constraint governance_vote_challenges_choice_length check (char_length(choice) between 1 and 80),
  constraint governance_vote_challenges_wallet_address_length check (char_length(wallet_address) between 10 and 160),
  constraint governance_vote_challenges_wallet_network check (wallet_network in ('-239', '-3')),
  constraint governance_vote_challenges_text_length check (char_length(challenge_text) between 32 and 4000),
  constraint governance_vote_challenges_expiry check (expires_at > created_at)
);

create table if not exists public.governance_votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.governance_proposals(id) on delete cascade,
  voter_key text not null,
  choice text not null,
  wallet_address text not null,
  wallet_network text not null,
  signature text not null,
  signature_domain text not null,
  signed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint governance_votes_voter_key_length check (char_length(voter_key) = 64),
  constraint governance_votes_choice_length check (char_length(choice) between 1 and 80),
  constraint governance_votes_wallet_address_length check (char_length(wallet_address) between 10 and 160),
  constraint governance_votes_wallet_network check (wallet_network in ('-239', '-3')),
  constraint governance_votes_signature_length check (char_length(signature) between 40 and 256),
  constraint governance_votes_domain_length check (char_length(signature_domain) between 1 and 255),
  unique (proposal_id, voter_key),
  unique (proposal_id, wallet_address)
);

create index if not exists governance_proposals_status_closes_idx
  on public.governance_proposals(status, closes_at desc);
create index if not exists governance_vote_challenges_lookup_idx
  on public.governance_vote_challenges(id, voter_key, expires_at)
  where consumed_at is null;
create index if not exists governance_votes_proposal_choice_idx
  on public.governance_votes(proposal_id, choice);

alter table public.governance_proposals enable row level security;
alter table public.governance_proposals force row level security;
alter table public.governance_vote_challenges enable row level security;
alter table public.governance_vote_challenges force row level security;
alter table public.governance_votes enable row level security;
alter table public.governance_votes force row level security;

revoke all on public.governance_proposals from public, anon, authenticated;
revoke all on public.governance_vote_challenges from public, anon, authenticated;
revoke all on public.governance_votes from public, anon, authenticated;
grant all on public.governance_proposals to service_role;
grant all on public.governance_vote_challenges to service_role;
grant all on public.governance_votes to service_role;

-- The browser never queries these tables directly. Every request is validated by
-- the private Telegram session API, then executed with the server-only service role.

create or replace function public.cast_governance_vote(
  p_challenge_id uuid,
  p_voter_key text,
  p_signature text,
  p_signature_domain text,
  p_signed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_row public.governance_vote_challenges%rowtype;
  proposal_row public.governance_proposals%rowtype;
  inserted_vote_id uuid;
begin
  select * into challenge_row
  from public.governance_vote_challenges
  where id = p_challenge_id
    and voter_key = p_voter_key
  for update;

  if challenge_row.id is null
    or challenge_row.consumed_at is not null
    or challenge_row.expires_at <= now() then
    raise exception 'VOTE_CHALLENGE_EXPIRED';
  end if;

  select * into proposal_row
  from public.governance_proposals
  where id = challenge_row.proposal_id
  for update;

  if proposal_row.id is null
    or proposal_row.status <> 'open'
    or proposal_row.closes_at <= now() then
    raise exception 'VOTE_PROPOSAL_CLOSED';
  end if;

  if not (proposal_row.options ? challenge_row.choice) then
    raise exception 'VOTE_OPTION_INVALID';
  end if;

  update public.governance_vote_challenges
  set consumed_at = now()
  where id = challenge_row.id;

  insert into public.governance_votes (
    proposal_id,
    voter_key,
    choice,
    wallet_address,
    wallet_network,
    signature,
    signature_domain,
    signed_at
  ) values (
    challenge_row.proposal_id,
    challenge_row.voter_key,
    challenge_row.choice,
    challenge_row.wallet_address,
    challenge_row.wallet_network,
    p_signature,
    p_signature_domain,
    p_signed_at
  )
  returning id into inserted_vote_id;

  return inserted_vote_id;
end;
$$;

revoke all on function public.cast_governance_vote(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cast_governance_vote(uuid, text, text, text, timestamptz)
  to service_role;
