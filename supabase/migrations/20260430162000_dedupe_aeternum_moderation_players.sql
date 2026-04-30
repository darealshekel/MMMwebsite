create temporary table tmp_aeternum_player_stats_dedupe on commit drop as
with normalized as (
  select
    id,
    lower(trim(server_name)) as source_key,
    lower(
      trim(
        regexp_replace(
          regexp_replace(coalesce(nullif(username_lower, ''), username), '\s+', ' ', 'g'),
          '(\s*\(\s*new\s*\)\s*)+$',
          '',
          'gi'
        )
      )
    ) as canonical_username,
    trim(
      regexp_replace(
        regexp_replace(username, '\s+', ' ', 'g'),
        '(\s*\(\s*new\s*\)\s*)+$',
        '',
        'gi'
      )
    ) as display_username,
    player_digs,
    total_digs,
    latest_update,
    updated_at,
    player_id,
    is_fake_player
  from public.aeternum_player_stats
),
ranked as (
  select
    *,
    row_number() over (
      partition by source_key, canonical_username
      order by
        (player_id is not null) desc,
        player_digs desc,
        total_digs desc,
        latest_update desc nulls last,
        updated_at desc nulls last
    ) as row_rank,
    max(player_digs) over (partition by source_key, canonical_username) as merged_player_digs,
    max(total_digs) over (partition by source_key, canonical_username) as merged_total_digs,
    max(latest_update) over (partition by source_key, canonical_username) as merged_latest_update,
    bool_and(is_fake_player) over (partition by source_key, canonical_username) as merged_is_fake_player
  from normalized
  where canonical_username <> ''
)
select * from ranked;

delete from public.aeternum_player_stats stats
using tmp_aeternum_player_stats_dedupe dedupe
where stats.id = dedupe.id
  and dedupe.row_rank > 1;

update public.aeternum_player_stats stats
set
  username = coalesce(nullif(dedupe.display_username, ''), dedupe.canonical_username),
  username_lower = dedupe.canonical_username,
  player_digs = dedupe.merged_player_digs,
  total_digs = dedupe.merged_total_digs,
  latest_update = coalesce(dedupe.merged_latest_update, stats.latest_update),
  is_fake_player = dedupe.merged_is_fake_player,
  updated_at = now()
from tmp_aeternum_player_stats_dedupe dedupe
where stats.id = dedupe.id
  and dedupe.row_rank = 1;
