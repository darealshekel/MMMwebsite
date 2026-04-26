-- MMM mod sync schema.
-- The current MMM auth/profile table is public.users. Keep downstream sync column
-- names as player_id for compatibility, but point them at public.users(id).

alter table public.users
  add column if not exists client_id text,
  add column if not exists username text,
  add column if not exists username_lower text,
  add column if not exists minecraft_uuid text,
  add column if not exists minecraft_uuid_hash text,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists last_mod_version text,
  add column if not exists last_minecraft_version text,
  add column if not exists last_server_name text,
  add column if not exists total_synced_blocks bigint not null default 0,
  add column if not exists total_sessions bigint not null default 0,
  add column if not exists total_play_seconds bigint not null default 0,
  add column if not exists trust_level text not null default 'standard';

update public.users
set username_lower = lower(username)
where username is not null
  and (username_lower is null or username_lower <> lower(username));

update public.users u
set
  username = coalesce(u.username, ca.minecraft_username),
  username_lower = coalesce(u.username_lower, lower(ca.minecraft_username)),
  minecraft_uuid = coalesce(u.minecraft_uuid, ca.minecraft_uuid),
  minecraft_uuid_hash = coalesce(u.minecraft_uuid_hash, ca.minecraft_uuid_hash),
  last_seen_at = greatest(u.last_seen_at, ca.updated_at),
  updated_at = now()
from public.connected_accounts ca
where ca.user_id = u.id
  and ca.minecraft_uuid_hash is not null;

create unique index if not exists users_client_id_unique_idx
  on public.users (client_id)
  where client_id is not null and client_id <> '';

create unique index if not exists users_minecraft_uuid_hash_unique_idx
  on public.users (minecraft_uuid_hash)
  where minecraft_uuid_hash is not null and minecraft_uuid_hash <> '';

create index if not exists users_username_lower_idx
  on public.users (username_lower)
  where username_lower is not null and username_lower <> '';

create table if not exists public.worlds_or_servers (
  id uuid primary key default gen_random_uuid(),
  world_key text not null unique,
  display_name text not null default 'Unknown World',
  kind text not null default 'unknown',
  host text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  approval_status text not null default 'pending',
  submitted_by_player_id uuid references public.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  source_scope text not null default 'public_server',
  icon_url text,
  scoreboard_title text,
  sample_sidebar_lines jsonb not null default '[]'::jsonb,
  detected_stat_fields jsonb not null default '[]'::jsonb,
  scan_confidence integer not null default 0,
  raw_scan_evidence jsonb,
  scan_fingerprint text,
  last_scan_at timestamptz,
  last_scan_submitted_by_player_id uuid references public.users(id) on delete set null,
  constraint worlds_or_servers_kind_check check (kind in ('singleplayer', 'multiplayer', 'realm', 'unknown')),
  constraint worlds_or_servers_approval_status_check check (approval_status in ('pending', 'approved', 'rejected')),
  constraint worlds_or_servers_source_scope_check check (source_scope in ('public_server', 'private_singleplayer', 'unsupported'))
);

create index if not exists worlds_or_servers_approval_status_idx
  on public.worlds_or_servers (approval_status);
create index if not exists worlds_or_servers_source_scope_idx
  on public.worlds_or_servers (source_scope);
create index if not exists worlds_or_servers_submitted_by_idx
  on public.worlds_or_servers (submitted_by_player_id);
create index if not exists worlds_or_servers_scan_fingerprint_idx
  on public.worlds_or_servers (scan_fingerprint);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  source_type text not null default 'server',
  is_public boolean not null default false,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sources_public_approved_idx
  on public.sources (is_public, is_approved);

create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.users(id) on delete cascade,
  source_id uuid references public.sources(id) on delete cascade,
  score bigint not null default 0,
  rank_cached integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leaderboard_entries_player_source_unique
  on public.leaderboard_entries (player_id, source_id);

create unique index if not exists leaderboard_entries_player_global_unique
  on public.leaderboard_entries (player_id)
  where source_id is null;

create index if not exists leaderboard_entries_source_score_idx
  on public.leaderboard_entries (source_id, score desc);
create index if not exists leaderboard_entries_player_idx
  on public.leaderboard_entries (player_id);

create table if not exists public.mining_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.users(id) on delete cascade,
  world_id uuid references public.worlds_or_servers(id) on delete set null,
  session_key text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  active_seconds integer not null default 0,
  total_blocks bigint not null default 0,
  average_bph integer not null default 0,
  peak_bph integer not null default 0,
  best_streak_seconds integer not null default 0,
  top_block text,
  status text not null default 'active',
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, session_key),
  constraint mining_sessions_status_check check (status in ('active', 'paused', 'ended'))
);

create index if not exists mining_sessions_player_status_idx
  on public.mining_sessions (player_id, status, ended_at);

create table if not exists public.session_block_breakdown (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mining_sessions(id) on delete cascade,
  block_id text not null,
  count bigint not null default 0,
  unique (session_id, block_id)
);

create table if not exists public.session_rate_points (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mining_sessions(id) on delete cascade,
  point_index integer not null,
  blocks_per_hour integer not null default 0,
  elapsed_seconds integer not null default 0,
  unique (session_id, point_index)
);

create table if not exists public.player_world_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.users(id) on delete cascade,
  world_id uuid not null references public.worlds_or_servers(id) on delete cascade,
  total_blocks bigint not null default 0,
  total_sessions bigint not null default 0,
  total_play_seconds bigint not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, world_id)
);

create index if not exists player_world_stats_player_idx
  on public.player_world_stats (player_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.users(id) on delete cascade,
  project_key text not null,
  name text not null default 'Project',
  progress bigint not null default 0,
  goal bigint,
  is_active boolean not null default false,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, project_key)
);

create table if not exists public.daily_goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.users(id) on delete cascade,
  goal_date text not null,
  target bigint not null default 0,
  progress bigint not null default 0,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, goal_date)
);

create table if not exists public.synced_stats (
  player_id uuid primary key references public.users(id) on delete cascade,
  blocks_per_hour integer not null default 0,
  estimated_finish_seconds integer,
  current_project_name text,
  current_project_progress bigint,
  current_project_goal bigint,
  daily_progress bigint,
  daily_target bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aeternum_player_stats (
  id uuid primary key default gen_random_uuid(),
  source_world_id uuid references public.worlds_or_servers(id) on delete set null,
  player_id uuid references public.users(id) on delete set null,
  minecraft_uuid text,
  minecraft_uuid_hash text,
  username text not null,
  username_lower text not null,
  player_digs bigint not null default 0,
  total_digs bigint not null default 0,
  server_name text not null default 'Aeternum',
  objective_title text,
  latest_update timestamptz not null default now(),
  is_fake_player boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (username_lower, source_world_id),
  unique (username_lower, server_name)
);

create index if not exists aeternum_player_stats_server_rank_idx
  on public.aeternum_player_stats (server_name, player_digs desc, total_digs desc);
create index if not exists aeternum_player_stats_uuid_hash_idx
  on public.aeternum_player_stats (minecraft_uuid_hash);
create index if not exists aeternum_player_stats_source_world_id_idx
  on public.aeternum_player_stats (source_world_id);
create index if not exists aeternum_player_stats_fake_player_idx
  on public.aeternum_player_stats (is_fake_player);

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

create or replace function public.get_or_create_source(
  p_slug text,
  p_display_name text,
  p_source_type text default 'server',
  p_is_public boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id uuid;
begin
  select id into v_source_id
  from public.sources
  where slug = p_slug;

  if v_source_id is not null then
    update public.sources
    set
      display_name = coalesce(nullif(p_display_name, ''), display_name),
      source_type = coalesce(nullif(p_source_type, ''), source_type),
      is_public = sources.is_public or coalesce(p_is_public, false),
      updated_at = now()
    where id = v_source_id;

    return v_source_id;
  end if;

  insert into public.sources (
    slug,
    display_name,
    source_type,
    is_public,
    is_approved
  )
  values (
    p_slug,
    p_display_name,
    p_source_type,
    coalesce(p_is_public, false),
    false
  )
  returning id into v_source_id;

  return v_source_id;
end;
$$;

create or replace function public.refresh_player_global_leaderboard(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  select coalesce(sum(le.score), 0)
    into v_total
  from public.leaderboard_entries le
  join public.sources s on s.id = le.source_id
  where le.player_id = p_player_id
    and le.source_id is not null
    and (
      s.is_approved = true
      or exists (
        select 1
        from public.worlds_or_servers w
        where w.approval_status = 'approved'
          and (
            lower(w.display_name) = lower(s.display_name)
            or lower(coalesce(w.world_key, '')) = lower(s.slug)
          )
      )
    );

  if v_total = 0 then
    delete from public.leaderboard_entries
    where player_id = p_player_id
      and source_id is null;
    return;
  end if;

  insert into public.leaderboard_entries (
    player_id,
    source_id,
    score,
    rank_cached,
    updated_at
  )
  values (
    p_player_id,
    null,
    v_total,
    null,
    now()
  )
  on conflict ((player_id)) where source_id is null
  do update set
    score = excluded.score,
    rank_cached = null,
    updated_at = now();
end;
$$;

create or replace function public.submit_source_score(
  p_player_id uuid,
  p_source_slug text,
  p_source_display_name text,
  p_source_type text,
  p_score bigint,
  p_is_public boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id uuid;
  v_score bigint;
begin
  if p_player_id is null then
    raise exception 'submit_source_score: player_id is required';
  end if;

  if coalesce(trim(p_source_slug), '') = '' then
    raise exception 'submit_source_score: source_slug is required';
  end if;

  v_score := greatest(coalesce(p_score, 0), 0);

  v_source_id := public.get_or_create_source(
    p_source_slug,
    coalesce(nullif(trim(p_source_display_name), ''), p_source_slug),
    coalesce(nullif(trim(p_source_type), ''), 'server'),
    coalesce(p_is_public, false)
  );

  if v_score = 0 then
    perform public.refresh_player_global_leaderboard(p_player_id);
    return;
  end if;

  insert into public.leaderboard_entries (
    player_id,
    source_id,
    score,
    rank_cached,
    updated_at
  )
  values (
    p_player_id,
    v_source_id,
    v_score,
    null,
    now()
  )
  on conflict (player_id, source_id)
  do update set
    score = greatest(public.leaderboard_entries.score, excluded.score),
    rank_cached = null,
    updated_at = now();

  perform public.refresh_player_global_leaderboard(p_player_id);
end;
$$;

alter table public.worlds_or_servers enable row level security;
alter table public.sources enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.aeternum_player_stats enable row level security;
alter table public.aeternum_leaderboard_entries enable row level security;

drop policy if exists "public read worlds or servers" on public.worlds_or_servers;
create policy "public read worlds or servers"
  on public.worlds_or_servers
  for select
  using (true);

drop policy if exists "public read sources" on public.sources;
create policy "public read sources"
  on public.sources
  for select
  using (true);

drop policy if exists "public read leaderboard entries" on public.leaderboard_entries;
create policy "public read leaderboard entries"
  on public.leaderboard_entries
  for select
  using (true);

drop policy if exists "public read aeternum player stats" on public.aeternum_player_stats;
create policy "public read aeternum player stats"
  on public.aeternum_player_stats
  for select
  using (true);

drop policy if exists "public read aeternum leaderboard" on public.aeternum_leaderboard_entries;
create policy "public read aeternum leaderboard"
  on public.aeternum_leaderboard_entries
  for select
  using (true);

notify pgrst, 'reload schema';
