alter table public.aeternum_player_stats
  add column if not exists source_world_id uuid references public.worlds_or_servers(id) on delete set null;

create index if not exists idx_aeternum_player_stats_source_world_id
  on public.aeternum_player_stats(source_world_id);

update public.aeternum_player_stats aps
set source_world_id = w.id
from public.worlds_or_servers w
where aps.source_world_id is null
  and lower(aps.server_name) = 'aeternum'
  and lower(w.display_name) = 'aeternum'
  and lower(coalesce(w.world_key, '')) = 'mc.aeternumsmp.net';

update public.aeternum_player_stats aps
set source_world_id = w.id
from public.worlds_or_servers w
where aps.source_world_id is null
  and lower(aps.server_name) = lower(w.display_name);
