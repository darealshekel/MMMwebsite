# Privacy

AeTweaks keeps data collection minimal and privacy-safe by default.

## What data is collected

From the mod/backend sync flow:

- Minecraft username
- mined blocks and session statistics
- project and daily-goal progress
- last mod version
- last Minecraft version
- world/server display name
- encrypted Minecraft UUID
- hashed client identifier

For abuse prevention:

- a short-lived hashed representation of the requester IP address

## What is not stored in plaintext

- `client_id`
  - stored only as a keyed hash
- `minecraft_uuid`
  - stored encrypted at rest
- requester IP addresses
  - never stored raw

## What is discarded or minimized

- raw server hostnames are discarded
- raw request headers are not returned to clients
- browser UI state is stored in session storage instead of cookies
- the frontend does not request client IDs or encrypted UUID values

## Why data is collected

- username and mining stats
  - to power the AeTweaks dashboard and leaderboard
- mod/game version
  - to understand compatibility and sync health
- hashed IP rate-limit data
  - only for abuse prevention

## Retention

- sync rate-limit hashes: 7 days
- notifications: 30 days
- gameplay/profile data: kept while needed for product functionality unless manually deleted

## IP minimization

- IP addresses are only read transiently for rate limiting
- they are converted into keyed hashes with a rotating daily salt component
- raw IPs are not logged, stored, or exposed in responses

## User-facing privacy posture

- the site is HTTPS-only
- mixed content is blocked
- sensitive backend errors are not shown to users
- only minimized public fields are fetched into the browser

