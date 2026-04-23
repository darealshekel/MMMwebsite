-- Migration: reset_all_source_approvals
--
-- Purpose: Remove all pre-seeded / auto-approved source data so that
--   every source detected by the mod must go through the owner dashboard
--   approval flow before appearing on the leaderboard.
--
-- Changes:
--   1. Set approval_status = 'pending' for every row in worlds_or_servers
--      (clears the Aeternum auto-approval from the earlier migration).
--   2. Mark every row in sources as is_approved = false, is_public = false.
--   3. Delete cached global leaderboard aggregate rows (source_id IS NULL)
--      because they were computed from sources that are now unapproved.
--      Per-source leaderboard_entries are left in place but stay hidden
--      because sources.is_approved = false prevents them from surfacing.

-- ── 1. Reset all world / server approval status ─────────────────────────────
update public.worlds_or_servers
set
  approval_status        = 'pending',
  reviewed_by_user_id    = null,
  reviewed_at            = null;

-- ── 2. Mark all sources as unapproved and private ───────────────────────────
update public.sources
set
  is_approved = false,
  is_public   = false,
  updated_at  = now();

-- ── 3. Clear stale global aggregate rows ────────────────────────────────────
-- These rows had source_id IS NULL and represented combined scores across
-- now-unapproved sources.  They will be rebuilt automatically by
-- refresh_player_global_leaderboard when a source gets approved.
delete from public.leaderboard_entries
where source_id is null;
