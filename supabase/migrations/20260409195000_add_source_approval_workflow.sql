alter table public.worlds_or_servers
  add column if not exists approval_status text not null default 'pending',
  add column if not exists submitted_by_player_id uuid references public.players(id) on delete set null,
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists reviewed_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worlds_or_servers_approval_status_check'
  ) then
    alter table public.worlds_or_servers
      add constraint worlds_or_servers_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists worlds_or_servers_approval_status_idx
  on public.worlds_or_servers (approval_status);

create index if not exists worlds_or_servers_submitted_by_idx
  on public.worlds_or_servers (submitted_by_player_id);

update public.worlds_or_servers
set
  approval_status = 'approved',
  submitted_at = coalesce(submitted_at, first_seen_at, now())
where
  lower(coalesce(display_name, '')) = 'aeternum'
  or lower(coalesce(world_key, '')) in ('aeternum', 'mc.aeternumsmp.net');

update public.users
set profile_preferences =
  jsonb_set(
    jsonb_set(coalesce(profile_preferences, '{}'::jsonb), '{role}', '"owner"'::jsonb, true),
    '{isAdmin}',
    'true'::jsonb,
    true
  )
where id in (
  select user_id
  from public.connected_accounts
  where lower(minecraft_username) = '5hekel'
);
