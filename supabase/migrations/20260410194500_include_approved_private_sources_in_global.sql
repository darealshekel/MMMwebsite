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
  join public.sources s
    on s.id = le.source_id
  where le.player_id = p_player_id
    and le.source_id is not null
    and s.is_approved = true;

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

do $$
declare
  v_player record;
begin
  for v_player in
    select distinct player_id
    from public.leaderboard_entries
    where player_id is not null
  loop
    perform public.refresh_player_global_leaderboard(v_player.player_id);
  end loop;
end;
$$;
