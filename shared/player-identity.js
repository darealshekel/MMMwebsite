const INVISIBLE_PLAYER_NAME_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;
const NEW_PLAYER_SUFFIX = /(?:\s*\(\s*new\s*\)\s*)+$/i;

export function cleanPlayerDisplayName(value) {
  return String(value ?? "")
    .replace(INVISIBLE_PLAYER_NAME_CHARS, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(NEW_PLAYER_SUFFIX, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function canonicalPlayerName(value) {
  return cleanPlayerDisplayName(value).toLowerCase();
}
