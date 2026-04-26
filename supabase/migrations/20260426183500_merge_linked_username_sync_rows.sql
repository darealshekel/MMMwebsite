-- Merge mod-created duplicate user rows into the dashboard-linked user row when
-- they share the same claimed Minecraft username. This keeps existing sync data
-- visible to the logged-in account without changing the linked UUID claim.

do $$
declare
  pair record;
begin
  for pair in
    with linked_users as (
      select distinct on (lower(ca.minecraft_username))
        lower(ca.minecraft_username) as username_lower,
        ca.user_id as target_id
      from public.connected_accounts ca
      where coalesce(trim(ca.minecraft_username), '') <> ''
      order by lower(ca.minecraft_username), ca.updated_at desc
    )
    select
      u.id as source_id,
      linked_users.target_id
    from public.users u
    join linked_users on linked_users.username_lower = u.username_lower
    where u.id <> linked_users.target_id
      and (
        u.client_id is not null
        or coalesce(u.total_synced_blocks, 0) > 0
        or exists (select 1 from public.leaderboard_entries le where le.player_id = u.id)
        or exists (select 1 from public.aeternum_player_stats aps where aps.player_id = u.id)
        or exists (select 1 from public.player_world_stats pws where pws.player_id = u.id)
      )
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
      set last_scan_submitted_by_player_id = pair.target_id
    where last_scan_submitted_by_player_id = pair.source_id;

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
          updated_at = now()
    from public.users source
    where target.id = pair.target_id
      and source.id = pair.source_id;

    delete from public.users where id = pair.source_id;
  end loop;
end;
$$;
