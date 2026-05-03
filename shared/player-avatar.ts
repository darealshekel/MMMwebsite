export const DEFAULT_STEVE_SKIN_FACE_URL = "https://nmsr.nickac.dev/face/Steve";
export const DEFAULT_STEVE_SKIN_BUST_URL = "https://nmsr.nickac.dev/bust/Steve";
export const DEFAULT_STEVE_FULLBODY_URL = "https://nmsr.nickac.dev/fullbody/Steve";
const WHITESPACE_USERNAME = /\s/;
const MINECRAFT_UUID = /^[0-9a-f]{32}$/i;

function cleanAvatarName(value: unknown) {
  return String(value ?? "").trim();
}

function cleanMinecraftUuid(value: unknown) {
  const compact = String(value ?? "").trim().replace(/-/g, "");
  return MINECRAFT_UUID.test(compact) ? compact : "";
}

export function buildNmsrFaceUrl(username: unknown) {
  const cleanUsername = cleanAvatarName(username);
  if (!cleanUsername || WHITESPACE_USERNAME.test(cleanUsername)) {
    return DEFAULT_STEVE_SKIN_FACE_URL;
  }
  return cleanUsername
    ? `https://nmsr.nickac.dev/face/${encodeURIComponent(cleanUsername)}`
    : DEFAULT_STEVE_SKIN_FACE_URL;
}

export function buildNmsrBustUrl(username: unknown, uuid?: unknown) {
  const cleanUsername = cleanAvatarName(username);
  if (!cleanUsername || WHITESPACE_USERNAME.test(cleanUsername)) {
    return DEFAULT_STEVE_SKIN_BUST_URL;
  }
  const cleanUuid = cleanMinecraftUuid(uuid);
  if (cleanUuid) {
    return `https://nmsr.nickac.dev/bust/${encodeURIComponent(cleanUuid)}/${encodeURIComponent(cleanUsername)}`;
  }
  return cleanUsername
    ? `https://nmsr.nickac.dev/bust/${encodeURIComponent(cleanUsername)}`
    : DEFAULT_STEVE_SKIN_BUST_URL;
}

export function buildNmsrFullBodyUrl(username: unknown) {
  const cleanUsername = cleanAvatarName(username);
  if (!cleanUsername || WHITESPACE_USERNAME.test(cleanUsername)) {
    return DEFAULT_STEVE_FULLBODY_URL;
  }
  return cleanUsername
    ? `https://nmsr.nickac.dev/fullbody/${encodeURIComponent(cleanUsername)}`
    : DEFAULT_STEVE_FULLBODY_URL;
}
