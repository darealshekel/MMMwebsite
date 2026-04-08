create table if not exists public.aeternum_player_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id) on delete set null,
  minecraft_uuid text,
  username text not null,
  username_lower text not null,
  player_digs bigint not null default 0,
  total_digs bigint not null default 0,
  server_name text not null default 'Aeternum',
  objective_title text,
  latest_update timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (username_lower, server_name)
);

create index if not exists aeternum_player_stats_server_rank_idx
  on public.aeternum_player_stats (server_name, player_digs desc, total_digs desc);

alter table public.aeternum_player_stats enable row level security;

drop policy if exists "public read aeternum player stats" on public.aeternum_player_stats;
create policy "public read aeternum player stats"
  on public.aeternum_player_stats
  for select
  using (true);
