-- Materialize an approved world/server into canonical source leaderboard rows in
-- one database round trip. This replaces the previous API-side per-player loop,
-- which can exceed Vercel's 25s Edge response limit for large sources.

create or replace function public.materialize_approved_world_source(
  p_world_id uuid,
  p_source_id uuid
)
returns table(affected_player_id uuid)
language sql
security definer
set search_path = public
as $$
  with score_candidates as (
    select
      pws.player_id,
      greatest(coalesce(pws.total_blocks, 0), 0)::bigint as score
    from public.player_world_stats pws
    where pws.world_id = p_world_id
      and pws.player_id is not null
      and pws.total_blocks > 0

    union all

    select
      coalesce(aps.player_id, u.id) as player_id,
      greatest(coalesce(aps.player_digs, 0), 0)::bigint as score
    from public.aeternum_player_stats aps
    left join public.users u
      on u.username_lower = lower(trim(aps.username))
    where aps.source_world_id = p_world_id
      and aps.is_fake_player = false
      and aps.player_digs > 0
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
      score = greatest(public.leaderboard_entries.score, excluded.score),
      rank_cached = null,
      updated_at = now()
    returning public.leaderboard_entries.player_id
  ),
  affected as (
    select best_scores.player_id from best_scores
    union
    select previously_linked.player_id from previously_linked
    union
    select source_upsert.player_id from source_upsert
  ),
  global_totals as (
    select
      affected.player_id,
      coalesce(
        sum(le.score) filter (where s.is_approved = true),
        0
      )::bigint as score
    from affected
    left join public.leaderboard_entries le
      on le.player_id = affected.player_id
      and le.source_id is not null
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
