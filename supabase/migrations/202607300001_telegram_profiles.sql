create table if not exists public.telegram_profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  first_name text not null,
  last_name text,
  username text,
  language_code text,
  photo_url text,
  is_premium boolean not null default false,
  selected_avatar_id text,
  selected_seat integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.telegram_profiles enable row level security;

revoke all on public.telegram_profiles from anon, authenticated;

