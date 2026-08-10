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
  vault_row public.fund_vaults%rowtype;
  snapshot_count integer;
  unique_voter_count integer;
  unique_subject_count integer;
  snapshot_total numeric(78, 0);
  current_balances jsonb;
  submitted_balances jsonb;
begin
  select * into vault_row
  from public.fund_vaults
  where slug = p_vault_slug
  for update;

  if vault_row.slug is null or vault_row.status <> 'active' then
    raise exception 'FUND_VAULT_NOT_ACTIVE';
  end if;

  if jsonb_typeof(p_snapshots) <> 'array' or jsonb_array_length(p_snapshots) = 0 then
    raise exception 'FUND_SNAPSHOT_EMPTY';
  end if;

  select
    count(*),
    count(distinct snapshot.value ->> 'voter_key'),
    count(distinct snapshot.value ->> 'subject_hash'),
    coalesce(sum((snapshot.value ->> 'share_units')::numeric), 0),
    jsonb_agg(
      jsonb_build_object(
        'subject_hash', snapshot.value ->> 'subject_hash',
        'share_units', snapshot.value ->> 'share_units'
      )
      order by snapshot.value ->> 'subject_hash'
    )
  into snapshot_count, unique_voter_count, unique_subject_count, snapshot_total, submitted_balances
  from jsonb_array_elements(p_snapshots) as snapshot(value)
  where (snapshot.value ->> 'subject_hash') ~ '^[0-9a-f]{64}$'
    and (snapshot.value ->> 'voter_key') ~ '^[0-9a-f]{64}$'
    and (snapshot.value ->> 'share_units') ~ '^[0-9]+$'
    and (snapshot.value ->> 'share_units')::numeric > 0;

  if snapshot_count <> jsonb_array_length(p_snapshots)
    or unique_voter_count <> snapshot_count
    or unique_subject_count <> snapshot_count
    or snapshot_total <= 0
    or snapshot_count < p_member_quorum then
    raise exception 'FUND_SNAPSHOT_INVALID';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'subject_hash', balance.subject_hash,
      'share_units', balance.share_units::text
    )
    order by balance.subject_hash
  ), '[]'::jsonb)
  into current_balances
  from public.fund_share_balances as balance
  where balance.vault_slug = p_vault_slug
    and balance.share_units > 0
    and balance.voting_eligible_at <= now();

  if current_balances is distinct from submitted_balances
    or snapshot_total <> vault_row.total_share_units then
    raise exception 'FUND_SNAPSHOT_CHANGED';
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
