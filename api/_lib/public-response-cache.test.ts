import { describe, expect, it } from "vitest";
import { isPaginatedPublicPayloadForRequest } from "./public-response-cache.js";

describe("public response cache validation", () => {
  it("rejects stale cached first-page leaderboard payloads that only contain one row for View 20", () => {
    const url = new URL("https://mmm.test/api/leaderboard?page=1&pageSize=20");

    expect(isPaginatedPublicPayloadForRequest({
      page: 1,
      pageSize: 20,
      totalRows: 100,
      totalPages: 5,
      rows: [{ username: "OnlyOne" }],
    }, url)).toBe(false);
  });

  it("accepts correctly shaped View 20 cached leaderboard payloads", () => {
    const url = new URL("https://mmm.test/api/leaderboard?page=1&pageSize=20");

    expect(isPaginatedPublicPayloadForRequest({
      page: 1,
      pageSize: 20,
      totalRows: 100,
      totalPages: 5,
      rows: Array.from({ length: 20 }, (_, index) => ({ username: `Player${index}` })),
    }, url)).toBe(true);
  });
});
