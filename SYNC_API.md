# MMM Sync API

The mod should POST JSON to:

`https://<your-project-ref>.supabase.co/functions/v1/mmm-sync`

Optional header:

- `x-sync-secret: <shared secret>`

Use that only if you set `AE_SYNC_SHARED_SECRET` for the edge function.

Privacy notes:

- `client_id` is hashed before storage
- `minecraft_uuid` is encrypted before storage
- `world.host` is ignored and discarded server-side
- request IPs are only used for short-lived hashed rate limiting

## Example payload

```json
{
  "client_id": "mmm_3bb3e98b-2552-4f26-9d96-a54d9f5697b3",
  "minecraft_uuid": "00000000-0000-0000-0000-000000000001",
  "username": "Shekel",
  "mod_version": "1.0.0",
  "minecraft_version": "1.21.4",
  "world": {
    "key": "play.aeternum.net",
    "display_name": "play.aeternum.net",
    "kind": "multiplayer",
    "host": "play.aeternum.net"
  },
  "session": {
    "session_key": "sess_1712583195000",
    "started_at": "2026-04-08T12:00:00Z",
    "ended_at": "2026-04-08T13:03:00Z",
    "active_seconds": 3780,
    "total_blocks": 2340,
    "average_bph": 2228,
    "peak_bph": 6800,
    "best_streak_seconds": 840,
    "top_block": "minecraft:stone",
    "status": "ended",
    "block_breakdown": [
      { "block_id": "minecraft:stone", "count": 1880 },
      { "block_id": "minecraft:diorite", "count": 220 }
    ],
    "rate_points": []
  },
  "projects": [
    {
      "project_key": "main-project",
      "name": "Main Project",
      "progress": 4820,
      "goal": 7200,
      "is_active": true
    }
  ],
  "daily_goal": {
    "goal_date": "2026-04-08",
    "target": 1000,
    "progress": 830,
    "completed": false
  },
  "synced_stats": {
    "blocks_per_hour": 2228,
    "estimated_finish_seconds": 4980,
    "current_project_name": "Main Project",
    "current_project_progress": 4820,
    "current_project_goal": 7200,
    "daily_progress": 830,
    "daily_target": 1000
  }
}
```
