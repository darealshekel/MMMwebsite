-- Migration: lock_approval_to_dashboard_only
--
-- Purpose: The sync edge function must never be able to approve sources.
-- Only an owner/admin action in the dashboard should flip is_approved = true.
--
-- Changes:
--   1. Rewrite get_or_create_source to never read or write is_approved.
--      New sources are always inserted with is_approved = false.
--      Existing sources: is_approved is never touched on update.
--   2. Rewrite submit_source_score to drop the p_is_approved parameter.
--   3. Ensure the sources.is_approved column defaults to false.

-- ── 1. Ensure the column default is false (defensive) ───────────────────────
alter table public.sources
    alter column is_approved set default false;

-- ── 2. Rewrite get_or_create_source ─────────────────────────────────────────
create or replace function public.get_or_create_source(
    p_slug         text,
    p_display_name text,
    p_source_type  text,
    p_is_public    boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_source_id uuid;
begin
    select id
      into v_source_id
      from public.sources
     where slug = p_slug;

    if v_source_id is not null then
        update public.sources
           set display_name = coalesce(nullif(p_display_name, ''), display_name),
               source_type  = coalesce(nullif(p_source_type, ''), source_type),
               is_public    = sources.is_public or p_is_public,
               -- is_approved intentionally NOT touched here —
               -- approval is dashboard-only
               updated_at   = now()
         where id = v_source_id;

        return v_source_id;
    end if;

    insert into public.sources (
        slug,
        display_name,
        source_type,
        is_public,
        is_approved          -- always false for new sources created by sync
    )
    values (
        p_slug,
        p_display_name,
        p_source_type,
        p_is_public,
        false
    )
    returning id into v_source_id;

    return v_source_id;
end;
$$;

-- ── 3. Rewrite submit_source_score (drop p_is_approved param) ───────────────
create or replace function public.submit_source_score(
    p_player_id          uuid,
    p_source_slug        text,
    p_source_display_name text,
    p_source_type        text,
    p_score              bigint,
    p_is_public          boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_source_id uuid;
    v_score     bigint;
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
        coalesce(p_is_public, false)
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
        score       = greatest(public.leaderboard_entries.score, excluded.score),
        rank_cached = null,
        updated_at  = now();

    perform public.refresh_player_global_leaderboard(p_player_id);
end;
$$;
