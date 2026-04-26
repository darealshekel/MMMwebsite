-- Source moderation approval/rejection stores notes on worlds_or_servers.
-- Keep this migration separate because some live databases predate the
-- admin-management migration that originally introduced this column.

alter table public.worlds_or_servers
  add column if not exists review_note text;

notify pgrst, 'reload schema';
