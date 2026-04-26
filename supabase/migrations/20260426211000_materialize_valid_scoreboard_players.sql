-- Keep approved source materialization aligned with the website's canonical
-- source total: sum of valid per-player rows. The scoreboard grand total
-- (total_digs) is retained as evidence, but does not override player sums.

create or replace function public.materialize_approved_world_source(
  p_world_id uuid,
  p_source_id uuid
)
returns table(affected_player_id uuid)
language sql
security definer
set search_path = public
as $$
  with scoreboard_total as (
    select coalesce(max(aps.total_digs), 0)::bigint as server_total
    from public.aeternum_player_stats aps
    where aps.source_world_id = p_world_id
  ),
  mod_score_candidates as (
    select
      pws.player_id,
      greatest(coalesce(pws.total_blocks, 0), 0)::bigint as score
    from public.player_world_stats pws
    where pws.world_id = p_world_id
      and pws.player_id is not null
      and pws.total_blocks > 0
  ),
  scoreboard_raw as (
    select
      aps.player_id,
      trim(coalesce(nullif(aps.username, ''), aps.username_lower, '')) as username,
      lower(trim(coalesce(nullif(aps.username_lower, ''), aps.username, ''))) as username_lower,
      greatest(coalesce(aps.player_digs, 0), 0)::bigint as score,
      aps.latest_update
    from public.aeternum_player_stats aps
    cross join scoreboard_total st
    where aps.source_world_id = p_world_id
      and aps.is_fake_player = false
      and aps.player_digs > 0
      and lower(trim(coalesce(nullif(aps.username_lower, ''), aps.username, ''))) not in ('', 'player', 'unknown')
      and lower(trim(coalesce(nullif(aps.username_lower, ''), aps.username, ''))) !~ '^[0-9]{1,3}$'
      and lower(trim(coalesce(nullif(aps.username_lower, ''), aps.username, ''))) !~ '^(tp|dig|load|placer|piston|bore|trencher|digsort|fish|bb|nwe)[0-9]{1,2}$'
      and lower(trim(coalesce(nullif(aps.username_lower, ''), aps.username, ''))) !~ '^[0-9]{1,2}(load|digsort|wide)$'
      and lower(trim(coalesce(nullif(aps.username_lower, ''), aps.username, ''))) !~ '^(alex|steve)[0-9]$'
      and lower(trim(coalesce(nullif(aps.username_lower, ''), aps.username, ''))) <> 'h4ck0s'
      and not (st.server_total > 0 and aps.player_digs > st.server_total)
  ),
  scoreboard_best as (
    select distinct on (scoreboard_raw.username_lower)
      scoreboard_raw.player_id,
      scoreboard_raw.username,
      scoreboard_raw.username_lower,
      scoreboard_raw.score,
      scoreboard_raw.latest_update
    from scoreboard_raw
    order by scoreboard_raw.username_lower, scoreboard_raw.score desc, scoreboard_raw.latest_update desc
  ),
  scoreboard_existing_users as (
    select
      scoreboard_best.*,
      coalesce(scoreboard_best.player_id, u.id) as resolved_player_id
    from scoreboard_best
    left join public.users u
      on u.username_lower = scoreboard_best.username_lower
  ),
  inserted_scoreboard_users as (
    insert into public.users (
      client_id,
      username,
      username_lower,
      last_seen_at,
      updated_at
    )
    select
      'scoreboard:' || p_world_id::text || ':' || scoreboard_existing_users.username_lower,
      scoreboard_existing_users.username,
      scoreboard_existing_users.username_lower,
      now(),
      now()
    from scoreboard_existing_users
    where scoreboard_existing_users.resolved_player_id is null
    on conflict (client_id) where client_id is not null and client_id <> ''
    do update set
      username = excluded.username,
      username_lower = excluded.username_lower,
      last_seen_at = greatest(public.users.last_seen_at, excluded.last_seen_at),
      updated_at = excluded.updated_at
    returning public.users.id, public.users.username_lower
  ),
  scoreboard_score_candidates as (
    select
      coalesce(scoreboard_existing_users.resolved_player_id, inserted_scoreboard_users.id) as player_id,
      scoreboard_existing_users.score
    from scoreboard_existing_users
    left join inserted_scoreboard_users
      on inserted_scoreboard_users.username_lower = scoreboard_existing_users.username_lower
    where coalesce(scoreboard_existing_users.resolved_player_id, inserted_scoreboard_users.id) is not null
  ),
  score_candidates as (
    select player_id, score from mod_score_candidates
    union all
    select player_id, score from scoreboard_score_candidates
  ),
  best_scores as (
    select
      score_candidates.player_id,
      max(score_candidates.score)::bigint as score
    from score_candidates
    where score_candidates.player_id is not null
      and score_candidates.score > 0
    group by score_candidates.player_id
  ),
  previously_linked as (
    select le.player_id
    from public.leaderboard_entries le
    where le.source_id = p_source_id
      and le.player_id is not null
  ),
  target_source as (
    select coalesce(s.is_approved, false) as is_approved
    from public.sources s
    where s.id = p_source_id
  ),
  source_upsert as (
    insert into public.leaderboard_entries (
      player_id,
      source_id,
      score,
      rank_cached,
      updated_at
    )
    select
      best_scores.player_id,
      p_source_id,
      best_scores.score,
      null,
      now()
    from best_scores
    on conflict (player_id, source_id)
    do update set
      score = excluded.score,
      rank_cached = null,
      updated_at = now()
    returning public.leaderboard_entries.player_id
  ),
  source_delete as (
    delete from public.leaderboard_entries le
    where le.source_id = p_source_id
      and not exists (
        select 1
        from best_scores
        where best_scores.player_id = le.player_id
      )
    returning le.player_id
  ),
  affected as (
    select best_scores.player_id from best_scores
    union
    select previously_linked.player_id from previously_linked
    union
    select source_upsert.player_id from source_upsert
    union
    select source_delete.player_id from source_delete
  ),
  global_totals as (
    select
      affected.player_id,
      (
        case
          when coalesce((select target_source.is_approved from target_source), false)
            then coalesce(max(best_scores.score), 0)
          else 0
        end
        + coalesce(
          sum(le.score) filter (where s.is_approved = true),
          0
        )
      )::bigint as score
    from affected
    left join best_scores
      on best_scores.player_id = affected.player_id
    left join public.leaderboard_entries le
      on le.player_id = affected.player_id
      and le.source_id is not null
      and le.source_id <> p_source_id
    left join public.sources s
      on s.id = le.source_id
    group by affected.player_id
  ),
  global_upsert as (
    insert into public.leaderboard_entries (
      player_id,
      source_id,
      score,
      rank_cached,
      updated_at
    )
    select
      global_totals.player_id,
      null,
      global_totals.score,
      null,
      now()
    from global_totals
    where global_totals.score > 0
    on conflict ((player_id)) where source_id is null
    do update set
      score = excluded.score,
      rank_cached = null,
      updated_at = now()
    returning public.leaderboard_entries.player_id
  ),
  global_delete as (
    delete from public.leaderboard_entries le
    using global_totals
    where le.player_id = global_totals.player_id
      and le.source_id is null
      and global_totals.score <= 0
    returning le.player_id
  )
  select affected.player_id as affected_player_id
  from affected
  union
  select global_upsert.player_id as affected_player_id
  from global_upsert
  union
  select global_delete.player_id as affected_player_id
  from global_delete;
$$;

notify pgrst, 'reload schema';
