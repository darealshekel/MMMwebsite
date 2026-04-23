with invalid_sessions as (
  select id
  from public.mining_sessions
  where status is distinct from 'ended'
     or ended_at is null
     or coalesce(active_seconds, 0) < 900
)
delete from public.session_block_breakdown
where session_id in (select id from invalid_sessions);

with invalid_sessions as (
  select id
  from public.mining_sessions
  where status is distinct from 'ended'
     or ended_at is null
     or coalesce(active_seconds, 0) < 900
)
delete from public.session_rate_points
where session_id in (select id from invalid_sessions);

delete from public.mining_sessions
where status is distinct from 'ended'
   or ended_at is null
   or coalesce(active_seconds, 0) < 900;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mining_sessions_completed_only_check'
  ) then
    alter table public.mining_sessions
      add constraint mining_sessions_completed_only_check
      check (status = 'ended');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mining_sessions_ended_at_required_check'
  ) then
    alter table public.mining_sessions
      add constraint mining_sessions_ended_at_required_check
      check (ended_at is not null);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mining_sessions_min_duration_check'
  ) then
    alter table public.mining_sessions
      add constraint mining_sessions_min_duration_check
      check (coalesce(active_seconds, 0) >= 900);
  end if;
end $$;
