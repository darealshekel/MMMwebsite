create unique index if not exists leaderboard_entries_player_source_unique
  on public.leaderboard_entries (player_id, source_id)
  where source_id is not null;

create unique index if not exists leaderboard_entries_player_global_unique
  on public.leaderboard_entries (player_id)
  where source_id is null;

create or replace function public.submit_source_score(
  p_player_id uuid,
  p_source_slug text,
  p_source_display_name text,
  p_source_type text,
  p_score bigint,
  p_is_public boolean default false,
  p_is_approved boolean default false
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
    coalesce(p_is_public, false),
    coalesce(p_is_approved, false)
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
