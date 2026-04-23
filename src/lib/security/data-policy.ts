export const DATA_SECURITY_POLICY = {
  players: {
    username: { sensitivity: "public", storage: "plaintext", retentionDays: 3650 },
    client_id: { sensitivity: "sensitive", storage: "keyed-hash", retentionDays: 3650 },
    minecraft_uuid: { sensitivity: "sensitive", storage: "encrypted", retentionDays: 3650 },
    last_server_name: { sensitivity: "internal", storage: "plaintext", retentionDays: 3650 },
  },
  worlds: {
    host: { sensitivity: "sensitive", storage: "discarded", retentionDays: 0 },
  },
  requests: {
    ip_address: { sensitivity: "sensitive", storage: "rotating-key-hash", retentionDays: 7 },
    authorization: { sensitivity: "secret", storage: "discarded", retentionDays: 0 },
    cookie: { sensitivity: "secret", storage: "discarded", retentionDays: 0 },
  },
} as const;

export const DATA_RETENTION_DAYS = {
  syncRequestLimits: 7,
  notifications: 30,
  staleSessions: 365,
} as const;

export const SENSITIVE_FIELD_NAMES = [
  "authorization",
  "cookie",
  "set-cookie",
  "client_id",
  "minecraft_uuid",
  "ip",
  "ip_address",
  "x-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
  "email",
  "phone",
] as const;

export const PUBLIC_PLAYER_SELECT =
  "id,username,first_seen_at,last_seen_at,last_mod_version,last_minecraft_version,last_server_name,total_synced_blocks,total_sessions,total_play_seconds,trust_level";

export const PUBLIC_WORLD_SELECT = "id,display_name,kind";

export function isSensitiveFieldName(field: string) {
  return SENSITIVE_FIELD_NAMES.includes(field.toLowerCase() as (typeof SENSITIVE_FIELD_NAMES)[number]);
}

