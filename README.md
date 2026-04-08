# AeTweaks Site

Premium AeTweaks web dashboard and landing site, styled from the Lovable project and now wired for Supabase-backed sync data.

## Environment

Copy [.env.example](C:\Users\mult0\Downloads\mining-tracker-mod%20(7)\aetweaks-site\.env.example) to `.env` and fill in:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DEFAULT_PLAYER_USERNAME` (optional)
- `VITE_DEFAULT_CLIENT_ID` (optional)

If no Supabase env vars are set, the site falls back to polished demo data so the UI still renders cleanly.

## Expected Supabase tables

The frontend reads from these public/readable tables:

- `players`
- `projects`
- `mining_sessions`
- `daily_goals`
- `synced_stats`
- `player_world_stats`
- `worlds_or_servers`
- `notifications`
- `leaderboard_entries`
- `user_settings`

## Frontend data flow

- [src/lib/aetweaks-data.ts](C:\Users\mult0\Downloads\mining-tracker-mod%20(7)\aetweaks-site\src\lib\aetweaks-data.ts) builds one shared AeTweaks snapshot from Supabase REST endpoints.
- [src/hooks/use-aetweaks-snapshot.ts](C:\Users\mult0\Downloads\mining-tracker-mod%20(7)\aetweaks-site\src\hooks\use-aetweaks-snapshot.ts) exposes that snapshot through React Query.
- Dashboard, Projects, Sessions, Profile, and Settings all render from the same synced source.
