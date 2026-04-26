-- Source sync and approval must reuse an existing source row when the display
-- name already exists, even if the incoming slug differs.

create or replace function public.get_or_create_source(
  p_slug text,
  p_display_name text,
  p_source_type text default 'server',
  p_is_public boolean default false
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

  if v_source_id is null and coalesce(trim(p_display_name), '') <> '' then
    select id
      into v_source_id
    from public.sources
    where lower(display_name) = lower(trim(p_display_name))
    order by is_approved desc, is_public desc, updated_at desc nulls last
    limit 1;
  end if;

  if v_source_id is not null then
    update public.sources
    set
      display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      source_type = coalesce(nullif(trim(p_source_type), ''), source_type),
      is_public = sources.is_public or coalesce(p_is_public, false),
      -- Approval remains dashboard-only.
      updated_at = now()
    where id = v_source_id;

    return v_source_id;
  end if;

  insert into public.sources (
    slug,
    display_name,
    source_type,
    is_public,
    is_approved
  )
  values (
    p_slug,
    coalesce(nullif(trim(p_display_name), ''), p_slug),
    coalesce(nullif(trim(p_source_type), ''), 'server'),
    coalesce(p_is_public, false),
    false
  )
  returning id into v_source_id;

  return v_source_id;
end;
$$;
