const SERVER_ALIASES = new Set([
  "server",
  "private-server",
  "private_server",
  "private server",
  "multiplayer",
]);

const SSP_ALIASES = new Set([
  "ssp",
  "singleplayer",
  "single-player",
  "single player",
  "world",
]);

const HSP_ALIASES = new Set([
  "hsp",
  "hardcore",
  "hardcore-singleplayer",
  "hardcore singleplayer",
  "hardcore single-player",
  "hardcore single player",
]);

export const CANONICAL_SOURCE_TYPES = ["server", "ssp", "hsp"];

export function normalizeSourceTypeLabel(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, " ");
}

export function normalizeSourceType(value, fallback = "server") {
  const normalized = normalizeSourceTypeLabel(value);
  if (SERVER_ALIASES.has(normalized)) return "server";
  if (SSP_ALIASES.has(normalized)) return "ssp";
  if (HSP_ALIASES.has(normalized)) return "hsp";
  return fallback;
}

export function normalizeSourceTypeOrNull(value) {
  const normalized = normalizeSourceType(value, null);
  return CANONICAL_SOURCE_TYPES.includes(normalized) ? normalized : null;
}

export function isServerSourceType(value) {
  return normalizeSourceType(value, null) === "server";
}

export function sourceScopeForType(value) {
  const normalized = normalizeSourceTypeOrNull(value);
  if (!normalized) return "unsupported";
  return normalized === "server" ? "public_server" : "private_singleplayer";
}

export function sourceKindForType(value) {
  const normalized = normalizeSourceTypeOrNull(value);
  if (!normalized) return "unknown";
  return normalized === "server" ? "multiplayer" : "singleplayer";
}
