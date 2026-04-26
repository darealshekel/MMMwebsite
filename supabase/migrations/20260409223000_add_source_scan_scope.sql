alter table public.worlds_or_servers
  add column if not exists source_scope text not null default 'public_server',
  add column if not exists icon_url text,
  add column if not exists scoreboard_title text,
  add column if not exists sample_sidebar_lines jsonb not null default '[]'::jsonb,
  add column if not exists detected_stat_fields jsonb not null default '[]'::jsonb,
  add column if not exists scan_confidence integer not null default 0,
  add column if not exists raw_scan_evidence jsonb,
  add column if not exists scan_fingerprint text,
  add column if not exists last_scan_at timestamptz,
  add column if not exists last_scan_submitted_by_player_id uuid references public.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worlds_or_servers_source_scope_check'
  ) then
    alter table public.worlds_or_servers
      add constraint worlds_or_servers_source_scope_check
      check (source_scope in ('public_server', 'private_singleplayer', 'unsupported'));
  end if;
end $$;

create index if not exists worlds_or_servers_source_scope_idx
  on public.worlds_or_servers (source_scope);

create index if not exists worlds_or_servers_scan_fingerprint_idx
  on public.worlds_or_servers (scan_fingerprint);

update public.worlds_or_servers
set source_scope =
  case
    when kind = 'singleplayer' then 'private_singleplayer'
    when lower(coalesce(display_name, '')) = 'aeternum'
      or lower(coalesce(world_key, '')) in ('aeternum', 'mc.aeternumsmp.net')
      or lower(coalesce(host, '')) = 'mc.aeternumsmp.net'
      then 'public_server'
    else 'public_server'
  end
where source_scope is distinct from
  case
    when kind = 'singleplayer' then 'private_singleplayer'
    when lower(coalesce(display_name, '')) = 'aeternum'
      or lower(coalesce(world_key, '')) in ('aeternum', 'mc.aeternumsmp.net')
      or lower(coalesce(host, '')) = 'mc.aeternumsmp.net'
      then 'public_server'
    else 'public_server'
  end;
