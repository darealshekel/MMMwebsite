export const APP_ROLES = ["player", "admin", "owner"];

export const OWNER_PROTECTED_ROLE = "owner";

export const PLAYER_FLAG_CODE_PATTERN = /^[a-z]{2}$/;

export const SITE_CONTENT_KEYS = [
  "dashboard.heroTitle",
  "dashboard.heroSubtitle",
  "leaderboard.mainTitle",
  "leaderboard.mainDescription",
];

export function normalizeAppRole(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "owner") return "owner";
  if (normalized === "admin") return "admin";
  if (normalized === "member") return "player";
  return "player";
}

export function isManagementRole(role) {
  return normalizeAppRole(role) !== "player";
}

export function isOwnerRole(role) {
  return normalizeAppRole(role) === "owner";
}

export function isValidAppRole(role) {
  return APP_ROLES.includes(normalizeAppRole(role));
}

export function normalizeMinecraftUuid(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const compact = raw.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return null;
  }

  return compact;
}

export function formatMinecraftUuid(value) {
  const normalized = normalizeMinecraftUuid(value);
  if (!normalized) return null;
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20),
  ].join("-");
}

export function uuidLookupForms(value) {
  const compact = normalizeMinecraftUuid(value);
  if (!compact) return [];
  const dashed = formatMinecraftUuid(compact);
  return [...new Set([compact, dashed])].filter(Boolean);
}

export function normalizePlayerFlagCode(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return null;
  return PLAYER_FLAG_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function isAllowedSiteContentKey(value) {
  return SITE_CONTENT_KEYS.includes(String(value ?? ""));
}

export function sanitizeEditableText(value, maxLength = 120) {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() : "";
  return text.slice(0, maxLength);
}

export function sanitizeRejectReason(value) {
  return sanitizeEditableText(value, 240);
}

export function sanitizeSiteContentValue(value) {
  return sanitizeEditableText(value, 280);
}

export function parseNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return Math.round(parsed);
}

export function canTransitionRole(options) {
  const actorRole = normalizeAppRole(options.actorRole);
  const targetCurrentRole = normalizeAppRole(options.targetCurrentRole);
  const nextRole = normalizeAppRole(options.nextRole);
  const ownerCount = Number.isFinite(options.ownerCount) ? Number(options.ownerCount) : 0;
  const isSelf = options.isSelf === true;

  if (!isValidAppRole(nextRole)) {
    return { ok: false, reason: "Invalid role." };
  }

  if (actorRole === "player") {
    return { ok: false, reason: "Only admins or owners can change roles." };
  }

  if (actorRole === "admin") {
    if (targetCurrentRole === "owner" || nextRole === "owner") {
      return { ok: false, reason: "Admins cannot grant, edit, or remove owner access." };
    }
    return { ok: true };
  }

  if (targetCurrentRole === "owner" && nextRole !== "owner" && ownerCount <= 1) {
    return { ok: false, reason: "At least one owner must remain assigned." };
  }

  if (isSelf && targetCurrentRole === "owner" && nextRole !== "owner" && ownerCount <= 1) {
    return { ok: false, reason: "You cannot remove the last remaining owner." };
  }

  return { ok: true };
}
