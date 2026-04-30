import { describe, expect, it } from "vitest";
import { buildStaticLeaderboardResponse, buildStaticSpecialLeaderboardResponse, getStaticMainLeaderboardRows, getStaticPublicSources, getStaticSpecialSources } from "./static-mmm-leaderboard.js";
import { getSourceStats } from "./source-stats.js";

describe("static MMM leaderboard search", () => {
  it("calculates source stats from unique visible players", () => {
    const stats = getSourceStats({
      rows: [
        { username: "Miner", blocksMined: 100 },
        { username: " miner (new) ", blocksMined: 150 },
        { username: "OtherMiner", blocksMined: 20 },
        { username: "Player", blocksMined: 999 },
        { username: "", blocksMined: 50 },
      ],
    });

    expect(stats.playerCount).toBe(2);
    expect(stats.rowTotalBlocks).toBe(170);
    expect(stats.totalBlocks).toBe(170);
  });

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

  it("merges Hermitcraft alt accounts into their main player profiles", () => {
    const hermitcraft = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=hermitcraft&pageSize=200"));
    const mainRows = getStaticMainLeaderboardRows();
    const hiddenAltNames = [
      "rentheking",
      "evilxisuma",
      "xisumavoid",
      "helsknight",
      "isgall85",
      "badtimewithscar",
      "truesymmetry",
      "humancleo",
      "camm77",
      "biffa001",
      "impulsecam",
      "grianch",
    ];

    expect(hermitcraft?.totalBlocks).toBe(128_719_030);
    expect(hiddenAltNames.some((name) => mainRows.some((row) => String(row.username).toLowerCase() === name))).toBe(false);
    expect(hiddenAltNames.some((name) => hermitcraft?.rows.some((row) => String(row.username).toLowerCase() === name))).toBe(false);
    expect(mainRows.find((row) => String(row.username).toLowerCase() === "renthedog")?.blocksMined).toBe(8_459_036);
    expect(mainRows.find((row) => String(row.username).toLowerCase() === "xisuma")?.blocksMined).toBe(8_613_152);
    expect(mainRows.find((row) => String(row.username).toLowerCase() === "grian")?.blocksMined).toBe(5_451_388);
  });

  it("adds SMP Technique players to the existing source without duplicating it", () => {
    const publicSources = getStaticPublicSources();
    const smpTechniqueSources = publicSources.filter((source) => source.slug === "smp-technique");
    const smpTechnique = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=smp-technique&pageSize=100"));
    const mainRows = getStaticMainLeaderboardRows();

    expect(smpTechniqueSources).toHaveLength(1);
    expect(smpTechnique?.totalBlocks).toBe(100_821_071);
    expect(smpTechnique?.playerCount).toBe(20);
    expect(smpTechnique?.rows.find((row) => row.username === "Athissa")?.blocksMined).toBe(3_180);
    expect(smpTechnique?.rows.find((row) => row.username === "RidPMC")?.blocksMined).toBe(1);
    expect(mainRows.find((row) => row.username === "Athissa")?.sourceServer).toBe("SMP Technique");
  });

  it("adds Dugged source rows without duplicating the source", () => {
    const publicSources = getStaticPublicSources();
    const duggedSources = publicSources.filter((source) => source.slug === "dugged");
    const dugged = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=dugged&pageSize=120"));
    const mainRows = getStaticMainLeaderboardRows();

    expect(duggedSources).toHaveLength(1);
    expect(dugged?.totalBlocks).toBe(386_663_306);
    expect(dugged?.playerCount).toBe(92);
    expect(dugged?.rows.find((row) => row.username === "bm_78g")?.blocksMined).toBe(305_042);
    expect(dugged?.rows.find((row) => row.username === "Robi_Bot")?.blocksMined).toBe(288_707);
    expect(dugged?.rows.find((row) => row.username === "milkYw4i")?.blocksMined).toBe(1);
    expect(mainRows.find((row) => row.username === "bm_78g")?.sourceServer).toBe("Dugged");
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
    expect(mainRows.find((row) => String(row.username).toLowerCase() === "douglasgordo")?.blocksMined).toBe(150_164_824);
  });

  it("adds Dug SMP as a Server Digs source without duplicating existing players", () => {
    const dugSmp = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=dug-smp&pageSize=100"));
    const mainRows = getStaticMainLeaderboardRows();
    const expectedRows = new Map([
      ["wkeyaki", 10_300_000],
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
    expect(dugSmp?.totalBlocks).toBe(14_003_863);
    expect(dugSmp?.rows).toHaveLength(expectedRows.size);
    expect(dugSmp?.rows.some((row) => String(row.username).toLowerCase() === "wkeywki")).toBe(false);
    expect(mainRows.some((row) => String(row.username).toLowerCase() === "wkeywki")).toBe(false);

    for (const [playerKey, blocksMined] of expectedRows) {
      expect(dugSmp?.rows.find((row) => String(row.username).toLowerCase() === playerKey)?.blocksMined).toBe(blocksMined);
      expect(mainRows.filter((row) => String(row.username).toLowerCase() === playerKey)).toHaveLength(1);
    }
  });

  it("removes 5hekel's stale SSP World 03 row", () => {
    const ssphspSources = getStaticSpecialSources("ssp-hsp");
    const ssp = buildStaticSpecialLeaderboardResponse(new URL("https://mmm.test/api/leaderboard-special?kind=ssp&pageSize=200"));

    expect(ssphspSources.some((source) => String(source.id) === "special:ssp-hsp:digs:5hekel:individual-world-digs-03")).toBe(false);
    expect(ssp?.rows.some((row) => String(row.username).toLowerCase() === "5hekel" && Number(row.blocksMined) === 1_800_000)).toBe(false);
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
