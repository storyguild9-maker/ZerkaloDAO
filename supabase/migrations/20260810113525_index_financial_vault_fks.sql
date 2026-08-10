create index if not exists governance_proposals_fund_vault_idx
  on public.governance_proposals(fund_vault_slug);

create index if not exists governance_financial_actions_vault_idx
  on public.governance_financial_actions(vault_slug);
