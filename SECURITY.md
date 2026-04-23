# Security

AeTweaks is hardened for privacy-first production deployment.

## Transport security

- Vercel serves the site over HTTPS only.
- [vercel.json](C:\Users\mult0\Downloads\mining-tracker-mod%20(7)\aetweaks-site\vercel.json) adds:
  - `Strict-Transport-Security`
  - `Content-Security-Policy`
  - `upgrade-insecure-requests`
  - `block-all-mixed-content`
  - `Referrer-Policy`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Permissions-Policy`
  - `Cross-Origin-Opener-Policy`
- The sync function only accepts HTTPS browser origins.

## Sensitive data handling

- `client_id` is never stored in plaintext. It is stored as a keyed HMAC hash.
- `minecraft_uuid` is encrypted at rest with AES-GCM using keys loaded from environment variables.
- Server hostnames are discarded during sync instead of being stored.
- IP addresses are never stored raw. They are only used for abuse protection as short-lived keyed hashes with a rotating daily salt component.

Field policy is defined in [data-policy.ts](C:\Users\mult0\Downloads\mining-tracker-mod%20(7)\aetweaks-site\src\lib\security\data-policy.ts).

## Key management

Set these environment variables in Supabase Edge Functions:

- `AE_ENCRYPTION_KEYS_JSON`
  - JSON object of key IDs to base64-encoded 32-byte AES keys
- `AE_PRIMARY_ENCRYPTION_KEY_ID`
  - current key ID used for new writes
- `AE_HASH_SECRET`
  - HMAC secret for deterministic hashing of client identifiers
- `AE_IP_HASH_SECRET`
  - HMAC secret used for rotating IP anonymization
- `AE_ALLOWED_ORIGINS`
  - comma-separated HTTPS origins allowed for browser-based requests
- `AE_SYNC_SHARED_SECRET`
  - shared secret for mod-to-backend sync

### Rotation

- Add a new AES key to `AE_ENCRYPTION_KEYS_JSON`
- switch `AE_PRIMARY_ENCRYPTION_KEY_ID` to the new key
- future writes use the new key ID automatically
- old records remain decryptable while their old key remains in the keyring

## Authentication and sessions

- No website user passwords are currently stored by this app.
- Password/session helpers live in:
  - [auth.ts](C:\Users\mult0\Downloads\mining-tracker-mod%20(7)\aetweaks-site\src\lib\security\auth.ts)
- Passwords are hashed with bcrypt at safe defaults.
- Session cookie defaults are `Secure`, `HttpOnly`, `SameSite=Strict`.
- Sensitive tokens should not be stored in `localStorage`.

## Logging and error handling

- Sensitive strings are redacted before logging.
- Redaction covers:
  - IP addresses
  - bearer tokens
  - cookies
  - authorization values
  - emails
  - phone numbers
- The sync function returns generic client-safe errors and does not expose stack traces, IPs, or infrastructure details.

## API hardening

- Input is validated and size-limited before processing.
- Requests are rate limited with anonymized IP+client hashing.
- Raw request metadata is not echoed back.
- Sync responses return only `{ "ok": true }`.

## Data minimization

- The browser no longer requests or renders:
  - `client_id`
  - `minecraft_uuid`
  - raw world hostnames
- Sidebar UI state no longer uses cookies and now uses session storage instead.

## Retention

Retention rules are defined in [data-policy.ts](C:\Users\mult0\Downloads\mining-tracker-mod%20(7)\aetweaks-site\src\lib\security\data-policy.ts) and enforced by the SQL helper created in:

- [20260408234000_security_hardening.sql](C:\Users\mult0\Downloads\mining-tracker-mod%20(7)\aetweaks-site\supabase\migrations\20260408234000_security_hardening.sql)

Current retention:

- sync rate-limit hashes: 7 days
- notifications: 30 days

## Backups and access

- Production backups and exports should remain encrypted in provider-managed storage.
- Production secrets must stay in Vercel/Supabase secret stores, never in git or client-side env vars.
- Developers should only access redacted, least-privilege production data.

