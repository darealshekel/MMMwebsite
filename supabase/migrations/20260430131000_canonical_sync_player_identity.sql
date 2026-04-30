create or replace function public.mmm_canonical_player_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          trim(
            replace(
              replace(
                replace(
                  replace(
                    replace(coalesce(p_name, ''), chr(8203), ''),
                    chr(8204),
                    ''
                  ),
                  chr(8205),
                  ''
                ),
                chr(8288),
                ''
              ),
              chr(65279),
              ''
            )
          ),
          '[[:space:]]+',
          ' ',
          'g'
        ),
        '[[:space:]]*\([[:space:]]*new[[:space:]]*\)[[:space:]]*$',
        '',
        'i'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

alter table public.users
  add column if not exists canonical_name text;

update public.users
set canonical_name = public.mmm_canonical_player_name(coalesce(username, username_lower, ''))
where coalesce(canonical_name, '') <> public.mmm_canonical_player_name(coalesce(username, username_lower, ''));

create index if not exists users_canonical_name_idx
  on public.users (canonical_name)
  where canonical_name is not null and canonical_name <> '';

do $$
declare
  pair record;
begin
  for pair in
    with ranked as (
      select
        u.id,
        u.canonical_name,
        first_value(u.id) over (
          partition by u.canonical_name
          order by
            case
              when u.role in ('owner', 'admin') then 0
              when exists (select 1 from public.connected_accounts ca where ca.user_id = u.id) then 1
              when u.discord_id is not null then 2
              when u.minecraft_uuid_hash is not null then 3
              else 4
            end,
            coalesce(u.total_synced_blocks, 0) desc,
            coalesce(u.last_seen_at, u.updated_at, u.created_at) desc,
            u.created_at asc
        ) as target_id
      from public.users u
      where coalesce(u.canonical_name, '') <> ''
    )
    select id as source_id, target_id
    from ranked
    where id <> target_id
  loop
    insert into public.leaderboard_entries (
      player_id,
      source_id,
      score,
      rank_cached,
      updated_at
    )
    select
      pair.target_id,
      le.source_id,
      le.score,
      le.rank_cached,
      le.updated_at
    from public.leaderboard_entries le
    where le.player_id = pair.source_id
      and le.source_id is not null
    on conflict (player_id, source_id)
    do update set
      score = greatest(public.leaderboard_entries.score, excluded.score),
      rank_cached = null,
      updated_at = greatest(public.leaderboard_entries.updated_at, excluded.updated_at);

    insert into public.leaderboard_entries (
      player_id,
      source_id,
      score,
      rank_cached,
      updated_at
    )
    select
      pair.target_id,
      null,
      le.score,
      le.rank_cached,
      le.updated_at
    from public.leaderboard_entries le
    where le.player_id = pair.source_id
      and le.source_id is null
    on conflict ((player_id)) where source_id is null
    do update set
      score = greatest(public.leaderboard_entries.score, excluded.score),
      rank_cached = null,
      updated_at = greatest(public.leaderboard_entries.updated_at, excluded.updated_at);

    delete from public.leaderboard_entries where player_id = pair.source_id;

    insert into public.player_world_stats (
      player_id,
      world_id,
      total_blocks,
      total_sessions,
      total_play_seconds,
      last_seen_at
    )
    select
      pair.target_id,
      pws.world_id,
      pws.total_blocks,
      pws.total_sessions,
      pws.total_play_seconds,
      pws.last_seen_at
    from public.player_world_stats pws
    where pws.player_id = pair.source_id
    on conflict (player_id, world_id)
    do update set
      total_blocks = greatest(public.player_world_stats.total_blocks, excluded.total_blocks),
      total_sessions = greatest(public.player_world_stats.total_sessions, excluded.total_sessions),
      total_play_seconds = greatest(public.player_world_stats.total_play_seconds, excluded.total_play_seconds),
      last_seen_at = greatest(public.player_world_stats.last_seen_at, excluded.last_seen_at);

    delete from public.player_world_stats where player_id = pair.source_id;

    update public.aeternum_player_stats
      set player_id = pair.target_id,
          updated_at = now()
    where player_id = pair.source_id;

    update public.worlds_or_servers
      set submitted_by_player_id = pair.target_id
    where submitted_by_player_id = pair.source_id;

    update public.worlds_or_servers
      set reviewed_by_user_id = pair.target_id
    where reviewed_by_user_id = pair.source_id;

    update public.worlds_or_servers
      set last_scan_submitted_by_player_id = pair.target_id
    where last_scan_submitted_by_player_id = pair.source_id;

    update public.connected_accounts
      set user_id = pair.target_id,
          updated_at = now()
    where user_id = pair.source_id;

    update public.auth_sessions
      set user_id = pair.target_id,
          updated_at = now()
    where user_id = pair.source_id;

    update public.auth_link_codes
      set linked_user_id = pair.target_id,
          updated_at = now()
    where linked_user_id = pair.source_id;

    update public.mmm_submissions
      set user_id = pair.target_id,
          updated_at = now()
    where user_id = pair.source_id;

    update public.mmm_submissions
      set reviewed_by_user_id = pair.target_id
    where reviewed_by_user_id = pair.source_id;

    update public.minecraft_profile_claims
      set reviewed_by_user_id = pair.target_id,
          updated_at = now()
    where reviewed_by_user_id = pair.source_id;

    update public.minecraft_profile_claims
      set user_id = pair.target_id,
          updated_at = now()
    where user_id = pair.source_id
      and not exists (
        select 1
        from public.minecraft_profile_claims existing
        where existing.user_id = pair.target_id
          and existing.status = 'approved'
          and public.minecraft_profile_claims.status = 'approved'
      );

    update public.player_metadata
      set player_id = pair.target_id,
          updated_at = now()
    where player_id = pair.source_id
      and not exists (
        select 1
        from public.player_metadata existing
        where existing.player_id = pair.target_id
      );

    update public.admin_audit_log
      set actor_user_id = pair.target_id
    where actor_user_id = pair.source_id;

    update public.site_content_overrides
      set updated_by_user_id = pair.target_id,
          updated_at = now()
    where updated_by_user_id = pair.source_id;

    update public.mmm_manual_overrides
      set updated_by_user_id = pair.target_id,
          updated_at = now()
    where updated_by_user_id = pair.source_id;

    update public.projects
      set player_id = pair.target_id
    where player_id = pair.source_id
      and not exists (
        select 1
        from public.projects existing
        where existing.player_id = pair.target_id
          and existing.project_key = public.projects.project_key
      );
    delete from public.projects where player_id = pair.source_id;

    update public.daily_goals
      set player_id = pair.target_id
    where player_id = pair.source_id
      and not exists (
        select 1
        from public.daily_goals existing
        where existing.player_id = pair.target_id
          and existing.goal_date = public.daily_goals.goal_date
      );
    delete from public.daily_goals where player_id = pair.source_id;

    update public.synced_stats target
      set blocks_per_hour = greatest(coalesce(target.blocks_per_hour, 0), coalesce(source.blocks_per_hour, 0)),
          current_project_progress = greatest(coalesce(target.current_project_progress, 0), coalesce(source.current_project_progress, 0)),
          daily_progress = greatest(coalesce(target.daily_progress, 0), coalesce(source.daily_progress, 0)),
          updated_at = now()
    from public.synced_stats source
    where target.player_id = pair.target_id
      and source.player_id = pair.source_id;

    update public.synced_stats
      set player_id = pair.target_id
    where player_id = pair.source_id
      and not exists (
        select 1
        from public.synced_stats existing
        where existing.player_id = pair.target_id
      );
    delete from public.synced_stats where player_id = pair.source_id;

    update public.mining_sessions
      set player_id = pair.target_id
    where player_id = pair.source_id
      and not exists (
        select 1
        from public.mining_sessions existing
        where existing.player_id = pair.target_id
          and existing.session_key = public.mining_sessions.session_key
      );
    delete from public.mining_sessions where player_id = pair.source_id;

    update public.users target
      set total_synced_blocks = greatest(coalesce(target.total_synced_blocks, 0), coalesce(source.total_synced_blocks, 0)),
          total_sessions = greatest(coalesce(target.total_sessions, 0), coalesce(source.total_sessions, 0)),
          total_play_seconds = greatest(coalesce(target.total_play_seconds, 0), coalesce(source.total_play_seconds, 0)),
          first_seen_at = least(target.first_seen_at, source.first_seen_at),
          last_seen_at = greatest(target.last_seen_at, source.last_seen_at),
          last_mod_version = coalesce(source.last_mod_version, target.last_mod_version),
          last_minecraft_version = coalesce(source.last_minecraft_version, target.last_minecraft_version),
          last_server_name = coalesce(source.last_server_name, target.last_server_name),
          discord_username = coalesce(target.discord_username, source.discord_username),
          discord_avatar = coalesce(target.discord_avatar, source.discord_avatar),
          updated_at = now()
    from public.users source
    where target.id = pair.target_id
      and source.id = pair.source_id;

    delete from public.users where id = pair.source_id;
  end loop;
end;
$$;

update public.users
set username_lower = canonical_name
where coalesce(canonical_name, '') <> ''
  and coalesce(username_lower, '') <> canonical_name;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'users_canonical_name_unique_idx'
  ) then
    create unique index users_canonical_name_unique_idx
      on public.users (canonical_name)
      where canonical_name is not null and canonical_name <> '';
  end if;
end $$;

notify pgrst, 'reload schema';
