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

export function shouldIncludeLeaderboardUsername(usernameLower: string, filteredFakeUsernames: readonly string[]) {
  return usernameLower !== "" && filteredFakeUsernames.includes(usernameLower) === false;
}
