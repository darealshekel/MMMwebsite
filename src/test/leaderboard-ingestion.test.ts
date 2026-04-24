import { describe, expect, it } from "vitest";
import { looksLikeSyntheticFakeUsername, normalizeFilteredFakeUsernames, shouldIncludeLeaderboardUsername } from "../../shared/leaderboard-ingestion";

function sanitize(value: unknown, fallback = "", maxLength = 128) {
  if (typeof value !== "string") return fallback;
  return value.trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLength);
}

describe("leaderboard ingestion fake-player filter", () => {
  it("normalizes filtered fake usernames safely", () => {
    expect(normalizeFilteredFakeUsernames(["  Bot_One  ", "", "BOT_TWO"], sanitize, 10)).toEqual([
      "bot_one",
      "bot_two",
    ]);
  });

  it("excludes usernames marked as filtered fake players", () => {
    const filtered = normalizeFilteredFakeUsernames(["FakeMiner"], sanitize, 10);
    expect(shouldIncludeLeaderboardUsername("fakeminer", filtered)).toBe(false);
    expect(shouldIncludeLeaderboardUsername("realminer", filtered)).toBe(true);
  });

  it("detects obvious synthetic carpet-style usernames", () => {
    expect(looksLikeSyntheticFakeUsername("tp20")).toBe(true);
    expect(looksLikeSyntheticFakeUsername("dig9")).toBe(true);
    expect(looksLikeSyntheticFakeUsername("5digsort")).toBe(true);
    expect(looksLikeSyntheticFakeUsername("alex4")).toBe(true);
    expect(looksLikeSyntheticFakeUsername("123")).toBe(true);
    expect(looksLikeSyntheticFakeUsername("luukeem")).toBe(false);
    expect(looksLikeSyntheticFakeUsername("lakim")).toBe(false);
  });
});
