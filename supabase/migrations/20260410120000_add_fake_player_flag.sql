-- Adds a persistent is_fake_player flag to aeternum_player_stats.
--
-- Purpose: Carpet bots and other fake/scripted players must never appear on
-- the website.  Previously, fake players were only removed reactively (deleted
-- when a leaderboard payload listed them in filtered_fake_usernames).  That
-- deletion could be undone by any subsequent sidebar or leaderboard sync that
-- did not include the fake-username list.
--
-- With this column:
--   - When a player is identified as fake their row is marked is_fake_player = TRUE
--     and their digs are zeroed out.  The row is kept so that re-insertion is
--     blocked at the application layer.
--   - All read queries (leaderboard, sync helpers) filter is_fake_player = FALSE
--     so fake players can never appear in stats, rankings, or aggregated totals.

ALTER TABLE public.aeternum_player_stats
  ADD COLUMN IF NOT EXISTS is_fake_player BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index so filtering fake players remains cheap even at large row counts.
CREATE INDEX IF NOT EXISTS aeternum_player_stats_fake_player_idx
  ON public.aeternum_player_stats (server_name, username_lower)
  WHERE is_fake_player = TRUE;
