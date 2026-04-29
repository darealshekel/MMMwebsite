import { describe, expect, it } from "vitest";
import { buildStaticLeaderboardResponse, buildStaticSpecialLeaderboardResponse, getStaticMainLeaderboardRows, getStaticPublicSources } from "./static-mmm-leaderboard.js";

describe("static MMM leaderboard search", () => {
  it("filters Digs rankings by player name without changing featured rows", () => {
    const unfiltered = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?pageSize=100"));
    expect(unfiltered).toBeTruthy();

    const target = unfiltered!.rows.find((row) => Number(row.rank ?? 0) > 3);
    expect(target).toBeTruthy();

    const filtered = buildStaticLeaderboardResponse(
      new URL(`https://mmm.test/api/leaderboard?pageSize=100&query=${encodeURIComponent(String(target!.username ?? ""))}`),
    );

    expect(filtered?.rows.some((row) => String(row.username ?? "").toLowerCase() === String(target!.username ?? "").toLowerCase())).toBe(true);
    expect(filtered?.featuredRows.map((row) => row.username)).toEqual(unfiltered!.featuredRows.map((row) => row.username));
  });

  it("does not treat source names as player search matches on the Digs page", () => {
    const unfiltered = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?pageSize=100"));
    expect(unfiltered).toBeTruthy();

    const sourceName = String(unfiltered!.rows.find((row) => String(row.sourceServer ?? "").trim())?.sourceServer ?? "");
    expect(sourceName).not.toBe("");

    const filtered = buildStaticLeaderboardResponse(
      new URL(`https://mmm.test/api/leaderboard?pageSize=100&query=${encodeURIComponent(sourceName)}`),
    );

    expect(filtered?.rows.every((row) => String(row.username ?? "").toLowerCase().includes(sourceName.toLowerCase()))).toBe(true);
  });

  it("uses the explicit DugRift logo and leaves BackStage logo blank", () => {
    const sources = getStaticPublicSources();
    const dugrift = sources.find((source) => source.slug === "dugrift-smp");
    const backstage = sources.find((source) => source.slug === "backstage-smp");

    expect(dugrift?.logoUrl).toBe("/generated/mmm-source-logos/dugrift-smp-dg.png");
    expect(backstage?.logoUrl).toBeNull();
  });

  it("applies the Eyome BackStage and DouglasGordo DugRift corrections", () => {
    const backstage = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=backstage-smp&pageSize=100"));
    const dugrift = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=dugrift-smp&pageSize=100"));
    const ssphsp = buildStaticSpecialLeaderboardResponse(new URL("https://mmm.test/api/leaderboard-special?kind=ssp-hsp&pageSize=200"));
    const mainRows = getStaticMainLeaderboardRows();

    expect(backstage?.totalBlocks).toBe(38_901_192);
    expect(backstage?.rows).toHaveLength(1);
    expect(backstage?.rows[0]).toEqual(expect.objectContaining({
      username: "eyome",
      blocksMined: 24_000_000,
      sourceServer: "BackStage SMP",
      sourceSlug: "backstage-smp",
    }));
    expect(backstage?.rows.some((row) => String(row.username).toLowerCase() === "douglasgordo")).toBe(false);

    expect(dugrift?.totalBlocks).toBe(17_055_782);
    expect(dugrift?.rows.find((row) => String(row.username).toLowerCase() === "douglasgordo")?.blocksMined).toBe(8_345_000);
    expect(dugrift?.rows.some((row) => String(row.username).toLowerCase() === "wkeyaki")).toBe(false);
    expect(dugrift?.rows.some((row) => String(row.username).toLowerCase() === "xs_power")).toBe(false);

    expect(ssphsp?.rows.some((row) => String(row.username).toLowerCase() === "eyome")).toBe(false);
    expect(mainRows.find((row) => String(row.username).toLowerCase() === "eyome")).toEqual(expect.objectContaining({
      blocksMined: 24_000_000,
      sourceServer: "BackStage SMP",
      sourceSlug: "backstage-smp",
    }));
    expect(mainRows.find((row) => String(row.username).toLowerCase() === "douglasgordo")?.blocksMined).toBe(142_505_559);
  });
});
