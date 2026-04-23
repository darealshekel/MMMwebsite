create table if not exists public.player_metadata (
  id uuid primary key default gen_random_uuid(),
  minecraft_uuid_hash text not null unique,
  player_id uuid references public.players(id) on delete set null,
  flag_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_metadata_player_id_idx
  on public.player_metadata (player_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_metadata_flag_code_check'
  ) then
    alter table public.player_metadata
      add constraint player_metadata_flag_code_check
      check (flag_code is null or flag_code ~ '^[a-z]{2}$');
  end if;
end $$;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text not null,
  action_type text not null,
  target_type text not null,
  target_id text not null,
  target_uuid_hash text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_actor_user_id_idx
  on public.admin_audit_log (actor_user_id);

create index if not exists admin_audit_log_target_uuid_hash_idx
  on public.admin_audit_log (target_uuid_hash);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

create table if not exists public.site_content_overrides (
  key text primary key,
  value text not null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_content_overrides_key_check'
  ) then
    alter table public.site_content_overrides
      add constraint site_content_overrides_key_check
      check (key in (
        'dashboard.heroTitle',
        'dashboard.heroSubtitle',
        'leaderboard.mainTitle',
        'leaderboard.mainDescription'
      ));
  end if;
end $$;

alter table public.worlds_or_servers
  add column if not exists review_note text;
