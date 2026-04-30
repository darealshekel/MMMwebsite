import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrichedDelayMs: 0,
  staticResponse: {
    scope: "main",
    rows: [{ username: "5hekel", blocksMined: 15_099_524 }],
    featuredRows: [],
    publicSources: [],
    page: 1,
    pageSize: 20,
    totalRows: 1,
    totalPages: 1,
    totalBlocks: 15_099_524,
  },
  enrichedResponse: {
    scope: "main",
    rows: [{ username: "5hekel", blocksMined: 16_017_660 }],
    featuredRows: [],
    publicSources: [],
    page: 1,
    pageSize: 20,
    totalRows: 1,
    totalPages: 1,
    totalBlocks: 16_017_660,
  },
  writeCachedPublicResponse: vi.fn(),
}));

vi.mock("./_lib/public-response-cache.js", () => ({
  isPaginatedPublicPayloadForRequest: vi.fn(() => true),
  mainLeaderboardResponseCacheKey: vi.fn(() => null),
  readCachedPublicResponse: vi.fn(() => null),
  writeCachedPublicResponse: mocks.writeCachedPublicResponse,
}));

vi.mock("./_lib/http.js", () => ({
  jsonResponse(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: init?.headers,
    });
  },
}));

vi.mock("./_lib/static-mmm-leaderboard.js", () => ({
  buildStaticLeaderboardResponse: vi.fn(() => mocks.staticResponse),
}));

vi.mock("./_lib/static-mmm-overrides.js", () => ({
  applyStaticManualOverridesToLeaderboardResponse: vi.fn(
    () => new Promise((resolve) => setTimeout(() => resolve(mocks.enrichedResponse), mocks.enrichedDelayMs)),
  ),
  buildApprovedSubmissionSourceLeaderboardResponse: vi.fn(() => Promise.resolve(null)),
}));

import handler from "./leaderboard.js";

describe("leaderboard API", () => {
  it("waits for enriched Player Rankings totals instead of returning stale static totals", async () => {
    vi.useFakeTimers();
    mocks.enrichedDelayMs = 900;

    try {
      const responsePromise = handler(new Request("https://mmm.test/api/leaderboard?page=1&pageSize=20"));
      await vi.runAllTimersAsync();
      const response = await responsePromise;
      const payload = await response.json();

      expect(payload.rows[0].blocksMined).toBe(16_017_660);
    } finally {
      vi.useRealTimers();
      mocks.enrichedDelayMs = 0;
    }
  });
});
