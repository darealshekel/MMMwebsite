create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  profile_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null unique,
  minecraft_uuid text not null,
  minecraft_uuid_hash text not null unique,
  minecraft_username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists connected_accounts_user_id_idx
  on public.connected_accounts (user_id);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_token_hash text not null unique,
  csrf_token_hash text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_id_idx
  on public.auth_sessions (user_id);

create index if not exists auth_sessions_expires_at_idx
  on public.auth_sessions (expires_at);

alter table public.players
  add column if not exists minecraft_uuid_hash text;

create index if not exists players_minecraft_uuid_hash_idx
  on public.players (minecraft_uuid_hash);

alter table public.aeternum_player_stats
  add column if not exists minecraft_uuid_hash text;

create index if not exists aeternum_player_stats_uuid_hash_idx
  on public.aeternum_player_stats (minecraft_uuid_hash);

alter table public.users enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.auth_sessions enable row level security;

