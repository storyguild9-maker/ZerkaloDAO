create table public.fund_vaults (
  slug text primary key,
  display_name text not null,
  asset_symbol text not null,
  asset_decimals smallint not null,
  network text not null default '-239',
  treasury_address text,
  total_share_units numeric(78, 0) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fund_vaults_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  constraint fund_vaults_display_name_length check (char_length(display_name) between 2 and 80),
  constraint fund_vaults_asset_symbol_length check (char_length(asset_symbol) between 2 and 16),
  constraint fund_vaults_asset_decimals_range check (asset_decimals between 0 and 30),
  constraint fund_vaults_network check (network in ('-239', '-3')),
  constraint fund_vaults_treasury_address_length check (
    treasury_address is null or char_length(treasury_address) between 10 and 160
  ),
  constraint fund_vaults_total_shares_nonnegative check (total_share_units >= 0),
  constraint fund_vaults_status check (status in ('active', 'paused', 'closed'))
);

insert into public.fund_vaults (
  slug,
  display_name,
  asset_symbol,
  asset_decimals,
  network
) values (
  'ton-main',
  'Общий фонд TON',
  'TON',
  9,
  '-239'
)
on conflict (slug) do nothing;

create table public.fund_share_balances (
  vault_slug text not null references public.fund_vaults(slug) on delete restrict,
  subject_hash text not null,
  share_units numeric(78, 0) not null,
  voting_eligible_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (vault_slug, subject_hash),
  constraint fund_share_balances_subject_hash check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint fund_share_balances_positive check (share_units > 0)
);

create table public.fund_share_ledger (
  id uuid primary key default gen_random_uuid(),
  vault_slug text not null references public.fund_vaults(slug) on delete restrict,
  subject_hash text not null,
  entry_type text not null,
  share_delta numeric(78, 0) not null,
  asset_amount_raw numeric(78, 0) not null,
  source_reference text not null unique,
  chain_tx_hash text,
  chain_lt text,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint fund_share_ledger_subject_hash check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint fund_share_ledger_entry_type check (entry_type in ('mint', 'burn')),
  constraint fund_share_ledger_delta_nonzero check (share_delta <> 0),
  constraint fund_share_ledger_delta_direction check (
    (entry_type = 'mint' and share_delta > 0)
    or (entry_type = 'burn' and share_delta < 0)
  ),
  constraint fund_share_ledger_asset_amount_nonnegative check (asset_amount_raw >= 0),
  constraint fund_share_ledger_reference_length check (char_length(source_reference) between 8 and 240),
  constraint fund_share_ledger_tx_hash_length check (
    chain_tx_hash is null or char_length(chain_tx_hash) between 16 and 160
  ),
  constraint fund_share_ledger_chain_lt_length check (
    chain_lt is null or char_length(chain_lt) between 1 and 40
  )
);

alter table public.governance_proposals
  add column kind text not null default 'standard',
  add column fund_vault_slug text references public.fund_vaults(slug) on delete restrict,
  add column snapshot_total_share_units numeric(78, 0),
  add column capital_quorum_bps integer,
  add column approval_threshold_bps integer,
  add column decision_status text not null default 'pending',
  add column winning_choice text,
  add column finalized_at timestamptz,
  add constraint governance_proposals_kind check (kind in ('standard', 'financial')),
  add constraint governance_proposals_snapshot_total_positive check (
    snapshot_total_share_units is null or snapshot_total_share_units > 0
  ),
  add constraint governance_proposals_capital_quorum_range check (
    capital_quorum_bps is null or capital_quorum_bps between 1 and 10000
  ),
  add constraint governance_proposals_approval_threshold_range check (
    approval_threshold_bps is null or approval_threshold_bps between 1 and 10000
  ),
  add constraint governance_proposals_decision_status check (
    decision_status in ('pending', 'completed', 'approved', 'rejected', 'cancelled')
  ),
  add constraint governance_proposals_financial_fields check (
    (
      kind = 'standard'
      and fund_vault_slug is null
      and snapshot_total_share_units is null
      and capital_quorum_bps is null
      and approval_threshold_bps is null
    )
    or (
      kind = 'financial'
      and fund_vault_slug is not null
      and snapshot_total_share_units is not null
      and capital_quorum_bps is not null
      and approval_threshold_bps is not null
    )
  );

create table public.governance_financial_actions (
  proposal_id uuid primary key references public.governance_proposals(id) on delete cascade,
  vault_slug text not null references public.fund_vaults(slug) on delete restrict,
  action_type text not null,
  amount_raw numeric(78, 0),
  destination text not null default '',
  action_payload jsonb not null,
  action_hash text not null,
  created_at timestamptz not null default now(),
  constraint governance_financial_actions_type check (
    action_type in ('stake', 'unstake', 'allocate', 'withdraw', 'external_transfer', 'policy_change')
  ),
  constraint governance_financial_actions_amount_nonnegative check (amount_raw is null or amount_raw >= 0),
  constraint governance_financial_actions_destination_length check (char_length(destination) <= 240),
  constraint governance_financial_actions_payload_object check (jsonb_typeof(action_payload) = 'object'),
  constraint governance_financial_actions_hash check (action_hash ~ '^[0-9a-f]{64}$')
);

create table public.governance_voter_snapshots (
  proposal_id uuid not null references public.governance_proposals(id) on delete cascade,
  subject_hash text not null,
  voter_key text not null,
  share_units numeric(78, 0) not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, voter_key),
  unique (proposal_id, subject_hash),
  constraint governance_voter_snapshots_subject_hash check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint governance_voter_snapshots_voter_key check (voter_key ~ '^[0-9a-f]{64}$'),
  constraint governance_voter_snapshots_shares_positive check (share_units > 0)
);

alter table public.governance_votes
  add column weight_units numeric(78, 0) not null default 1,
  add constraint governance_votes_weight_positive check (weight_units > 0);

create index fund_share_ledger_vault_subject_idx
  on public.fund_share_ledger(vault_slug, subject_hash, confirmed_at desc);
create index governance_voter_snapshots_proposal_idx
  on public.governance_voter_snapshots(proposal_id);
create index governance_voter_snapshots_subject_idx
  on public.governance_voter_snapshots(subject_hash, proposal_id);
create index governance_financial_actions_hash_idx
  on public.governance_financial_actions(action_hash);

alter table public.fund_vaults enable row level security;
alter table public.fund_vaults force row level security;
alter table public.fund_share_balances enable row level security;
alter table public.fund_share_balances force row level security;
alter table public.fund_share_ledger enable row level security;
alter table public.fund_share_ledger force row level security;
alter table public.governance_financial_actions enable row level security;
alter table public.governance_financial_actions force row level security;
alter table public.governance_voter_snapshots enable row level security;
alter table public.governance_voter_snapshots force row level security;

revoke all on public.fund_vaults from public, anon, authenticated;
revoke all on public.fund_share_balances from public, anon, authenticated;
revoke all on public.fund_share_ledger from public, anon, authenticated;
revoke all on public.governance_financial_actions from public, anon, authenticated;
revoke all on public.governance_voter_snapshots from public, anon, authenticated;

grant select on public.fund_vaults to service_role;
grant select on public.fund_share_balances to service_role;
grant select on public.fund_share_ledger to service_role;
grant select, insert on public.governance_financial_actions to service_role;
grant select, insert on public.governance_voter_snapshots to service_role;

create or replace function public.record_fund_share_change(
  p_vault_slug text,
  p_subject_hash text,
  p_entry_type text,
  p_share_delta numeric,
  p_asset_amount_raw numeric,
  p_source_reference text,
  p_chain_tx_hash text,
  p_chain_lt text,
  p_confirmed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  vault_row public.fund_vaults%rowtype;
  current_member_shares numeric(78, 0);
  next_member_shares numeric(78, 0);
  next_total_shares numeric(78, 0);
  locked_shares numeric(78, 0) := 0;
  ledger_id uuid;
begin
  if p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'FUND_SUBJECT_INVALID';
  end if;
  if p_entry_type not in ('mint', 'burn')
    or p_share_delta = 0
    or (p_entry_type = 'mint' and p_share_delta < 0)
    or (p_entry_type = 'burn' and p_share_delta > 0) then
    raise exception 'FUND_SHARE_CHANGE_INVALID';
  end if;
  if p_asset_amount_raw < 0 then
    raise exception 'FUND_ASSET_AMOUNT_INVALID';
  end if;

  select * into vault_row
  from public.fund_vaults
  where slug = p_vault_slug
  for update;

  if vault_row.slug is null or vault_row.status <> 'active' then
    raise exception 'FUND_VAULT_NOT_ACTIVE';
  end if;

  select share_units into current_member_shares
  from public.fund_share_balances
  where vault_slug = p_vault_slug
    and subject_hash = p_subject_hash
  for update;

  next_member_shares := coalesce(current_member_shares, 0) + p_share_delta;
  next_total_shares := vault_row.total_share_units + p_share_delta;
  if next_member_shares < 0 or next_total_shares < 0 then
    raise exception 'FUND_SHARE_BALANCE_NEGATIVE';
  end if;

  if p_entry_type = 'burn' then
    select coalesce(max(snapshot.share_units), 0)
    into locked_shares
    from public.governance_voter_snapshots as snapshot
    join public.governance_proposals as proposal
      on proposal.id = snapshot.proposal_id
    where snapshot.subject_hash = p_subject_hash
      and proposal.fund_vault_slug = p_vault_slug
      and proposal.status = 'open'
      and proposal.closes_at > now();

    if next_member_shares < locked_shares then
      raise exception 'FUND_SHARES_LOCKED_BY_ACTIVE_VOTE';
    end if;
  end if;

  insert into public.fund_share_ledger (
    vault_slug,
    subject_hash,
    entry_type,
    share_delta,
    asset_amount_raw,
    source_reference,
    chain_tx_hash,
    chain_lt,
    confirmed_at
  ) values (
    p_vault_slug,
    p_subject_hash,
    p_entry_type,
    p_share_delta,
    p_asset_amount_raw,
    p_source_reference,
    p_chain_tx_hash,
    p_chain_lt,
    p_confirmed_at
  )
  returning id into ledger_id;

  if next_member_shares = 0 then
    delete from public.fund_share_balances
    where vault_slug = p_vault_slug
      and subject_hash = p_subject_hash;
  else
    insert into public.fund_share_balances (
      vault_slug,
      subject_hash,
      share_units,
      voting_eligible_at,
      updated_at
    ) values (
      p_vault_slug,
      p_subject_hash,
      next_member_shares,
      p_confirmed_at,
      now()
    )
    on conflict (vault_slug, subject_hash) do update
    set share_units = excluded.share_units,
        updated_at = excluded.updated_at;
  end if;

  update public.fund_vaults
  set total_share_units = next_total_shares,
      updated_at = now()
  where slug = p_vault_slug;

  return ledger_id;
end;
$$;

revoke all on function public.record_fund_share_change(
  text, text, text, numeric, numeric, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_fund_share_change(
  text, text, text, numeric, numeric, text, text, text, timestamptz
) to service_role;

create or replace function public.create_financial_governance_proposal(
  p_proposal_id uuid,
  p_title text,
  p_description text,
  p_member_quorum integer,
  p_closes_at timestamptz,
  p_vault_slug text,
  p_capital_quorum_bps integer,
  p_approval_threshold_bps integer,
  p_action_type text,
  p_amount_raw numeric,
  p_destination text,
  p_action_payload jsonb,
  p_action_hash text,
  p_snapshots jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_count integer;
  unique_voter_count integer;
  unique_subject_count integer;
  snapshot_total numeric(78, 0);
begin
  if jsonb_typeof(p_snapshots) <> 'array' or jsonb_array_length(p_snapshots) = 0 then
    raise exception 'FUND_SNAPSHOT_EMPTY';
  end if;

  select
    count(*),
    count(distinct snapshot.value ->> 'voter_key'),
    count(distinct snapshot.value ->> 'subject_hash'),
    coalesce(sum((snapshot.value ->> 'share_units')::numeric), 0)
  into snapshot_count, unique_voter_count, unique_subject_count, snapshot_total
  from jsonb_array_elements(p_snapshots) as snapshot(value)
  where (snapshot.value ->> 'subject_hash') ~ '^[0-9a-f]{64}$'
    and (snapshot.value ->> 'voter_key') ~ '^[0-9a-f]{64}$'
    and (snapshot.value ->> 'share_units') ~ '^[0-9]+$'
    and (snapshot.value ->> 'share_units')::numeric > 0;

  if snapshot_count <> jsonb_array_length(p_snapshots)
    or unique_voter_count <> snapshot_count
    or unique_subject_count <> snapshot_count
    or snapshot_total <= 0 then
    raise exception 'FUND_SNAPSHOT_INVALID';
  end if;

  insert into public.governance_proposals (
    id,
    title,
    description,
    options,
    quorum,
    status,
    closes_at,
    kind,
    fund_vault_slug,
    snapshot_total_share_units,
    capital_quorum_bps,
    approval_threshold_bps
  ) values (
    p_proposal_id,
    p_title,
    p_description,
    jsonb_build_array('За', 'Против', 'Воздержаться'),
    p_member_quorum,
    'open',
    p_closes_at,
    'financial',
    p_vault_slug,
    snapshot_total,
    p_capital_quorum_bps,
    p_approval_threshold_bps
  );

  insert into public.governance_financial_actions (
    proposal_id,
    vault_slug,
    action_type,
    amount_raw,
    destination,
    action_payload,
    action_hash
  ) values (
    p_proposal_id,
    p_vault_slug,
    p_action_type,
    p_amount_raw,
    p_destination,
    p_action_payload,
    p_action_hash
  );

  insert into public.governance_voter_snapshots (
    proposal_id,
    subject_hash,
    voter_key,
    share_units
  )
  select
    p_proposal_id,
    snapshot.value ->> 'subject_hash',
    snapshot.value ->> 'voter_key',
    (snapshot.value ->> 'share_units')::numeric
  from jsonb_array_elements(p_snapshots) as snapshot(value);

  return p_proposal_id;
end;
$$;

revoke all on function public.create_financial_governance_proposal(
  uuid, text, text, integer, timestamptz, text, integer, integer,
  text, numeric, text, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_financial_governance_proposal(
  uuid, text, text, integer, timestamptz, text, integer, integer,
  text, numeric, text, jsonb, text, jsonb
) to service_role;

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
  vote_weight numeric(78, 0) := 1;
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

  if proposal_row.kind = 'financial' then
    select share_units into vote_weight
    from public.governance_voter_snapshots
    where proposal_id = proposal_row.id
      and voter_key = challenge_row.voter_key;

    if vote_weight is null or vote_weight <= 0 then
      raise exception 'VOTE_FINANCIAL_SHARE_REQUIRED';
    end if;
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
    signed_at,
    weight_units
  ) values (
    challenge_row.proposal_id,
    challenge_row.voter_key,
    challenge_row.choice,
    challenge_row.wallet_address,
    challenge_row.wallet_network,
    p_signature,
    p_signature_domain,
    p_signed_at,
    vote_weight
  )
  returning id into inserted_vote_id;

  return inserted_vote_id;
end;
$$;

revoke all on function public.cast_governance_vote(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cast_governance_vote(uuid, text, text, text, timestamptz)
  to service_role;

create or replace function public.finalize_governance_proposal(
  p_proposal_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal_row public.governance_proposals%rowtype;
  cast_weight numeric(78, 0) := 0;
  yes_weight numeric(78, 0) := 0;
  no_weight numeric(78, 0) := 0;
  participation_bps integer := 0;
  approval_bps integer := 0;
  participant_count integer := 0;
  final_decision text;
  final_choice text;
begin
  select * into proposal_row
  from public.governance_proposals
  where id = p_proposal_id
  for update;

  if proposal_row.id is null then
    raise exception 'VOTE_PROPOSAL_NOT_FOUND';
  end if;
  if proposal_row.status <> 'open' then
    return jsonb_build_object(
      'id', proposal_row.id,
      'status', proposal_row.status,
      'decision_status', proposal_row.decision_status
    );
  end if;
  if not p_force and proposal_row.closes_at > now() then
    raise exception 'VOTE_PROPOSAL_STILL_OPEN';
  end if;

  select
    count(*),
    coalesce(sum(weight_units), 0),
    coalesce(sum(weight_units) filter (where choice = proposal_row.options ->> 0), 0),
    coalesce(sum(weight_units) filter (where choice = proposal_row.options ->> 1), 0)
  into participant_count, cast_weight, yes_weight, no_weight
  from public.governance_votes
  where proposal_id = proposal_row.id;

  if proposal_row.kind = 'financial' then
    participation_bps := floor(cast_weight * 10000 / proposal_row.snapshot_total_share_units);
    if yes_weight + no_weight > 0 then
      approval_bps := floor(yes_weight * 10000 / (yes_weight + no_weight));
    end if;
    if participant_count >= proposal_row.quorum
      and participation_bps >= proposal_row.capital_quorum_bps
      and approval_bps >= proposal_row.approval_threshold_bps then
      final_decision := 'approved';
      final_choice := proposal_row.options ->> 0;
    else
      final_decision := 'rejected';
      final_choice := proposal_row.options ->> 1;
    end if;
  else
    final_decision := 'completed';
    select vote.choice into final_choice
    from public.governance_votes as vote
    where vote.proposal_id = proposal_row.id
    group by vote.choice
    order by count(*) desc, vote.choice asc
    limit 1;
  end if;

  update public.governance_proposals
  set status = 'closed',
      closed_at = now(),
      finalized_at = now(),
      decision_status = final_decision,
      winning_choice = final_choice
  where id = proposal_row.id;

  return jsonb_build_object(
    'id', proposal_row.id,
    'status', 'closed',
    'decision_status', final_decision,
    'winning_choice', final_choice,
    'participant_count', participant_count,
    'participation_bps', participation_bps,
    'approval_bps', approval_bps
  );
end;
$$;

revoke all on function public.finalize_governance_proposal(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_governance_proposal(uuid, boolean)
  to service_role;

create or replace function public.read_governance_state(p_limit integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_proposals as (
    select proposal.*
    from public.governance_proposals as proposal
    order by proposal.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select jsonb_build_object(
    'proposals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', proposal.id,
          'title', proposal.title,
          'description', proposal.description,
          'options', proposal.options,
          'quorum', proposal.quorum,
          'status', proposal.status,
          'created_at', proposal.created_at,
          'closes_at', proposal.closes_at,
          'closed_at', proposal.closed_at,
          'kind', proposal.kind,
          'fund_vault_slug', proposal.fund_vault_slug,
          'snapshot_total_share_units', proposal.snapshot_total_share_units::text,
          'capital_quorum_bps', proposal.capital_quorum_bps,
          'approval_threshold_bps', proposal.approval_threshold_bps,
          'decision_status', proposal.decision_status,
          'winning_choice', proposal.winning_choice,
          'finalized_at', proposal.finalized_at,
          'action_type', action.action_type,
          'amount_raw', action.amount_raw::text,
          'destination', action.destination,
          'action_hash', action.action_hash
        )
        order by proposal.created_at desc
      )
      from selected_proposals as proposal
      left join public.governance_financial_actions as action
        on action.proposal_id = proposal.id
    ), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'proposal_id', vote.proposal_id,
        'voter_key', vote.voter_key,
        'choice', vote.choice,
        'weight_units', vote.weight_units::text
      ))
      from public.governance_votes as vote
      where vote.proposal_id in (select id from selected_proposals)
    ), '[]'::jsonb),
    'snapshots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'proposal_id', snapshot.proposal_id,
        'voter_key', snapshot.voter_key,
        'share_units', snapshot.share_units::text
      ))
      from public.governance_voter_snapshots as snapshot
      where snapshot.proposal_id in (select id from selected_proposals)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.read_governance_state(integer)
  from public, anon, authenticated;
grant execute on function public.read_governance_state(integer)
  to service_role;

create or replace function public.read_fund_vaults(p_subject_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug', vault.slug,
      'display_name', vault.display_name,
      'asset_symbol', vault.asset_symbol,
      'asset_decimals', vault.asset_decimals,
      'network', vault.network,
      'status', vault.status,
      'total_share_units', vault.total_share_units::text,
      'my_share_units', coalesce(balance.share_units, 0)::text
    )
    order by vault.created_at asc
  ), '[]'::jsonb)
  from public.fund_vaults as vault
  left join public.fund_share_balances as balance
    on balance.vault_slug = vault.slug
    and balance.subject_hash = p_subject_hash;
$$;

revoke all on function public.read_fund_vaults(text)
  from public, anon, authenticated;
grant execute on function public.read_fund_vaults(text)
  to service_role;

create or replace function public.read_fund_share_snapshot(p_vault_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'vault', jsonb_build_object(
      'slug', vault.slug,
      'display_name', vault.display_name,
      'asset_symbol', vault.asset_symbol,
      'asset_decimals', vault.asset_decimals,
      'network', vault.network,
      'status', vault.status,
      'total_share_units', vault.total_share_units::text
    ),
    'balances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject_hash', balance.subject_hash,
        'share_units', balance.share_units::text
      ) order by balance.subject_hash)
      from public.fund_share_balances as balance
      where balance.vault_slug = vault.slug
        and balance.share_units > 0
        and balance.voting_eligible_at <= now()
    ), '[]'::jsonb)
  )
  from public.fund_vaults as vault
  where vault.slug = p_vault_slug;
$$;

revoke all on function public.read_fund_share_snapshot(text)
  from public, anon, authenticated;
grant execute on function public.read_fund_share_snapshot(text)
  to service_role;
