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
    expect(mainRows.find((row) => String(row.username).toLowerCase() === "douglasgordo")?.blocksMined).toBe(143_168_383);
  });

  it("adds Dug SMP as a Server Digs source without duplicating existing players", () => {
    const dugSmp = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=dug-smp&pageSize=100"));
    const mainRows = getStaticMainLeaderboardRows();
    const expectedRows = new Map([
      ["wkeywki", 4_154_734],
      ["xs_power", 1_163_722],
      ["photonjohn", 863_074],
      ["douglasgordo", 662_824],
      ["mooseref", 478_347],
      ["mattyrocco", 275_456],
      ["itsjamie020", 118_011],
      ["castermx13", 88_404],
      ["witherbloom", 24_280],
      ["applesteak", 20_519],
      ["annoyinganyone", 9_226],
    ]);

    expect(dugSmp?.source?.displayName).toBe("Dug SMP");
    expect(dugSmp?.source?.logoUrl).toBe("/generated/mmm-source-logos/dug-smp-dg.png");
    expect(dugSmp?.totalBlocks).toBe(7_858_597);
    expect(dugSmp?.rows).toHaveLength(expectedRows.size);

    for (const [playerKey, blocksMined] of expectedRows) {
      expect(dugSmp?.rows.find((row) => String(row.username).toLowerCase() === playerKey)?.blocksMined).toBe(blocksMined);
      expect(mainRows.filter((row) => String(row.username).toLowerCase() === playerKey)).toHaveLength(1);
    }
  });

  it("updates Mercury in place and removes shekel_ everywhere", () => {
    const mercury = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=mercury&pageSize=100"));
    const mainRows = getStaticMainLeaderboardRows();
    const expectedRows = new Map([
      ["lukarg", 8_862_488],
      ["mortamc", 2_116_348],
      ["shhad0", 1_961_038],
      ["5hekel", 1_463_524],
      ["amigodemenem", 1_442_646],
      ["ncp16", 919_691],
      ["zingiber05", 584_266],
      ["vale_elcapo", 549_848],
      ["nethermaster4", 529_727],
      ["exiledgrimmjow", 124_326],
      ["strinix_", 186],
      ["lemson", 99],
    ]);

    expect(mercury?.source?.id).toBe("private:043c4cc098a8e0a34d27b2ca83e791a4");
    expect(mercury?.source?.displayName).toBe("Mercury");
    expect(mercury?.rows.some((row) => String(row.username).toLowerCase() === "shekel_")).toBe(false);

    for (const [playerKey, blocksMined] of expectedRows) {
      expect(mercury?.rows.find((row) => String(row.username).toLowerCase() === playerKey)?.blocksMined).toBe(blocksMined);
      expect(mainRows.filter((row) => String(row.username).toLowerCase() === playerKey)).toHaveLength(1);
    }

    expect(mainRows.some((row) => String(row.username).toLowerCase() === "shekel_")).toBe(false);
  });
});
