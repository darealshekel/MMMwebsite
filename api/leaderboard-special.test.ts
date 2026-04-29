import { describe, expect, it } from "vitest";
import handler from "./leaderboard-special.js";
import { buildStaticSpecialLeaderboardResponse } from "./_lib/static-mmm-leaderboard.js";

async function specialResponse(kind: "ssp" | "hsp", page: number) {
  const url = `https://mmm.test/api/leaderboard-special?kind=${kind}&page=${page}&pageSize=20&refreshCache=1`;
  const response = await handler(new Request(url));
  expect(response.status).toBe(200);
  return response.json();
}

describe("special leaderboard API pagination", () => {
  it("serves SSP page 2 from the same static data used by the local build", async () => {
    const url = new URL("https://mmm.test/api/leaderboard-special?kind=ssp&page=2&pageSize=20");
    const expected = buildStaticSpecialLeaderboardResponse(url);
    const actual = await specialResponse("ssp", 2);

    expect(actual.totalRows).toBe(expected?.totalRows);
    expect(actual.totalPages).toBe(expected?.totalPages);
    expect(actual.rows.map((row: { username: string }) => row.username)).toEqual(expected?.rows.map((row) => row.username));
    expect(actual.rows.length).toBeGreaterThan(1);
  });

  it("serves HSP page 2 from the same static data used by the local build", async () => {
    const url = new URL("https://mmm.test/api/leaderboard-special?kind=hsp&page=2&pageSize=20");
    const expected = buildStaticSpecialLeaderboardResponse(url);
    const actual = await specialResponse("hsp", 2);

    expect(actual.totalRows).toBe(expected?.totalRows);
    expect(actual.totalPages).toBe(expected?.totalPages);
    expect(actual.rows.map((row: { username: string }) => row.username)).toEqual(expected?.rows.map((row) => row.username));
    expect(actual.rows.length).toBeGreaterThan(1);
  });
});
