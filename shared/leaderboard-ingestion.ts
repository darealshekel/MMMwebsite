export function normalizeFilteredFakeUsernames(
  values: string[] | null | undefined,
  sanitize: (value: unknown, fallback?: string, maxLength?: number) => string,
  maxItems: number,
) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .slice(0, maxItems)
    .map((value) => sanitize(value, "", 32).toLowerCase())
    .filter(Boolean);
}

const SYNTHETIC_BASE_WITH_SUFFIX = /^(?:tp|dig|load|placer|piston|bore|trencher|digsort|fish|bb|nwe)\d{1,2}$/i;
const SYNTHETIC_SUFFIX_WITH_BASE = /^\d{1,2}(?:load|digsort|wide)$/i;
const SYNTHETIC_DEFAULT_SKIN_WITH_SMALL_SUFFIX = /^(?:alex|steve)\d$/i;
const SYNTHETIC_NUMERIC_ONLY = /^\d{1,3}$/;
const SYNTHETIC_SPECIAL_CASES = new Set([
  "h4ck0s",
]);

const PLACEHOLDER_USERNAMES = new Set([
  "player",
  "unknown",
]);

export function looksLikeSyntheticFakeUsername(usernameLower: string) {
  if (!usernameLower) {
    return false;
  }

  return SYNTHETIC_NUMERIC_ONLY.test(usernameLower)
    || SYNTHETIC_BASE_WITH_SUFFIX.test(usernameLower)
    || SYNTHETIC_SUFFIX_WITH_BASE.test(usernameLower)
    || SYNTHETIC_DEFAULT_SKIN_WITH_SMALL_SUFFIX.test(usernameLower)
    || SYNTHETIC_SPECIAL_CASES.has(usernameLower);
}

export function isPlaceholderLeaderboardUsername(usernameLower: string) {
  return PLACEHOLDER_USERNAMES.has(usernameLower);
}

export function shouldIncludeLeaderboardUsername(usernameLower: string, filteredFakeUsernames: readonly string[]) {
  return usernameLower !== ""
    && isPlaceholderLeaderboardUsername(usernameLower) === false
    && filteredFakeUsernames.includes(usernameLower) === false
    && looksLikeSyntheticFakeUsername(usernameLower) === false;
}
