create index if not exists leaderboard_entries_global_score_idx
  on public.leaderboard_entries (score desc)
  where source_id is null;

create index if not exists worlds_or_servers_approval_status_submitted_idx
  on public.worlds_or_servers (approval_status, submitted_at desc nulls last, last_seen_at desc nulls last);

create index if not exists worlds_or_servers_approval_status_reviewed_idx
  on public.worlds_or_servers (approval_status, reviewed_at desc nulls last, last_seen_at desc nulls last);

create index if not exists player_world_stats_world_blocks_idx
  on public.player_world_stats (world_id, total_blocks desc)
  where total_blocks > 0;

create index if not exists aeternum_player_stats_source_world_idx
  on public.aeternum_player_stats (source_world_id)
  where source_world_id is not null;

create index if not exists mmm_submissions_status_created_idx
  on public.mmm_submissions (status, created_at desc);

