with ranked as (
  select
    ctid,
    row_number() over (
      partition by source_world_id, username_lower
      order by latest_update desc nulls last, updated_at desc nulls last
    ) as row_number
  from public.aeternum_player_stats
  where source_world_id is not null
)
delete from public.aeternum_player_stats aps
using ranked
where aps.ctid = ranked.ctid
  and ranked.row_number > 1;

update public.aeternum_player_stats aps
set server_name = w.display_name
from public.worlds_or_servers w
where aps.source_world_id = w.id
  and lower(coalesce(w.display_name, '')) <> 'aeternum';

create unique index if not exists aeternum_player_stats_source_username_uidx
  on public.aeternum_player_stats(source_world_id, username_lower)
  where source_world_id is not null;
