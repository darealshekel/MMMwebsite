create table if not exists public.aeternum_leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  server_key text not null default 'aeternum',
  username text not null,
  username_lower text not null,
  digs bigint not null default 0,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (server_key, username_lower)
);

create index if not exists aeternum_leaderboard_entries_server_idx
  on public.aeternum_leaderboard_entries (server_key, digs desc);

alter table public.aeternum_leaderboard_entries enable row level security;

drop policy if exists "public read aeternum leaderboard" on public.aeternum_leaderboard_entries;
create policy "public read aeternum leaderboard"
  on public.aeternum_leaderboard_entries
  for select
  using (true);
