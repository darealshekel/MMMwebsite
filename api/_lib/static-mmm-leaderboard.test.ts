import { describe, expect, it } from "vitest";
import { buildStaticLeaderboardResponse, buildStaticPlayerDetailResponse, buildStaticSpecialLeaderboardResponse, getStaticLandingTopSources, getStaticMainLeaderboardRows, getStaticPublicSources, getStaticSpecialSources } from "./static-mmm-leaderboard.js";
import { getSourceStats } from "./source-stats.js";

describe("static MMM leaderboard search", () => {
  it("honors View 20 for Player Digs, SSP, and HSP first pages", () => {
    const playerDigs = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?page=1&pageSize=20"));
    const ssp = buildStaticSpecialLeaderboardResponse(new URL("https://mmm.test/api/leaderboard-special?kind=ssp&page=1&pageSize=20"));
    const hsp = buildStaticSpecialLeaderboardResponse(new URL("https://mmm.test/api/leaderboard-special?kind=hsp&page=1&pageSize=20"));

    for (const payload of [playerDigs, ssp, hsp]) {
      expect(payload?.pageSize).toBe(20);
      expect(payload?.page).toBe(1);
      expect(payload?.rows).toHaveLength(Math.min(20, Number(payload?.totalRows ?? 0)));
    }
  });

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

  it("keeps Player Digs ranks contiguous after canonical player dedupe", () => {
    const page = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?page=8&pageSize=20"));
    const rows = page?.rows ?? [];

    expect(rows).toHaveLength(20);
    expect(rows.map((row) => row.rank)).toEqual(Array.from({ length: 20 }, (_, index) => 141 + index));
    expect(rows.find((row) => String(row.username).toLowerCase() === "xxattilaxx_00")).toEqual(expect.objectContaining({
      rank: 155,
      blocksMined: 10_745_000,
    }));
    expect(rows.find((row) => Number(row.rank) === 156)?.username).toBe("Terra021");

    const profile = buildStaticPlayerDetailResponse(new URL("https://mmm.test/api/player-detail?slug=xxattilaxx_00"));
    expect(profile?.rank).toBe(155);
    expect(profile?.blocksNum).toBe(10_745_000);
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

  it("builds landing largest sources from source leaderboard totals", () => {
    const topSources = getStaticLandingTopSources();

    expect(topSources.map((source) => source.displayName)).toEqual(["Sigma SMP", "Dugged", "Aeternum"]);
    expect(topSources.map((source) => source.totalBlocks)).toEqual([403_011_000, 386_663_306, 229_120_000]);
    expect(topSources.map((source) => source.playerCount)).toEqual([128, 92, 170]);
    for (const source of topSources) {
      const sourcePage = buildStaticLeaderboardResponse(new URL(`https://mmm.test/api/leaderboard?source=${source.slug}&pageSize=20`));
      expect(source.totalBlocks).toBe(sourcePage?.totalBlocks);
      expect(source.playerCount).toBe(sourcePage?.playerCount);
    }
  });

  it("returns source slugs for player profile per-server links", () => {
    const profile = buildStaticPlayerDetailResponse(new URL("https://mmm.test/api/player-detail?slug=athissa"));
    const smpTechnique = profile?.servers.find((server) => server.server === "SMP Technique");

    expect(smpTechnique?.sourceSlug).toBe("smp-technique");
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

  it("resets KháosTech to the approved source leaderboard", () => {
    const khaosTech = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=kh-ostech&pageSize=100"));
    const expectedRows = [
      ["c0ozy", 200_000],
      ["D1ncan", 158_456],
      ["RockDiagram1215", 131_469],
      ["Itz_HyperBoy", 61_590],
      ["Blue706", 58_753],
      ["mcgav99", 33_277],
      ["adryboy0713", 5_481],
      ["AzureMC", 3_239],
      ["Ragdoll_Willy", 2_951],
      ["Anonym_26893", 1_219],
      ["DemogorganYT", 540],
      ["Godzimc", 86],
      ["panda712", 46],
      ["nan_nand", 30],
    ] as const;

    expect(khaosTech?.source?.displayName).toBe("KháosTech");
    expect(khaosTech?.totalBlocks).toBe(657_137);
    expect(khaosTech?.playerCount).toBe(expectedRows.length);
    expect(khaosTech?.rows).toHaveLength(expectedRows.length);
    expect(khaosTech?.rows.map((row) => [row.username, row.blocksMined])).toEqual(expectedRows);
    expect(khaosTech?.rows.some((row) => ["_mpty_", "TMD274"].includes(String(row.username)))).toBe(false);
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

  it("adds TMD SMP as a Server Digs source without duplicating existing players", () => {
    const tmdSmp = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=tmd-smp&pageSize=100"));
    const publicSources = getStaticPublicSources();
    const mainRows = getStaticMainLeaderboardRows();
    const expectedRows = [
      ["mcgav99", "mcgav99", 3_400_000],
      ["d1ncan", "D1ncan", 1_345_000],
      ["c0ozy", "c0ozy", 1_145_000],
      ["itz_hyperboy", "Itz_HyperBoy", 537_000],
      ["minho_tv", "Minho_tv", 466_000],
      ["jakonix", "Jakonix", 306_000],
      ["tmd274", "TMD274", 185_000],
      ["bramjager", "bramjager", 156_000],
      ["chillytoffe", "ChillyToffe", 62_000],
      ["eeoms", "eeoms", 52_000],
      ["rockdiagram1215", "RockDiagram1215", 50_000],
      ["leonidqs", "Leonidqs", 42_000],
      ["shadyphilly", "ShadyPhilly", 40_000],
      ["blue706", "Blue706", 23_000],
      ["pablooroca", "pablooroca", 16_000],
      ["yankees88888g", "yankees88888g", 16_000],
    ] as const;

    expect(publicSources.filter((source) => source.slug === "tmd-smp")).toHaveLength(1);
    expect(tmdSmp?.source?.displayName).toBe("TMD SMP");
    expect(tmdSmp?.source?.logoUrl).toBeNull();
    expect(tmdSmp?.totalBlocks).toBe(7_841_000);
    expect(tmdSmp?.playerCount).toBe(expectedRows.length);
    expect(tmdSmp?.rows).toHaveLength(expectedRows.length);
    expect(tmdSmp?.rows.map((row) => [row.username, row.blocksMined])).toEqual(expectedRows.map(([, username, blocks]) => [username, blocks]));

    for (const [playerKey, , blocksMined] of expectedRows) {
      expect(tmdSmp?.rows.find((row) => String(row.username).toLowerCase() === playerKey)?.blocksMined).toBe(blocksMined);
      expect(mainRows.filter((row) => String(row.username).toLowerCase() === playerKey)).toHaveLength(1);
    }
  });

  it("removes NotAless50_ and its duplicate profile everywhere", () => {
    const mainRows = getStaticMainLeaderboardRows();
    const publicSources = getStaticPublicSources();
    const removedKeys = new Set(["notaless50", "notaless50_"]);

    for (const key of removedKeys) {
      expect(mainRows.some((row) => String(row.username).toLowerCase() === key)).toBe(false);
      expect(buildStaticPlayerDetailResponse(new URL(`https://mmm.test/api/player-detail?slug=${key}`))).toBeNull();
    }

    for (const source of publicSources) {
      const sourcePage = buildStaticLeaderboardResponse(new URL(`https://mmm.test/api/leaderboard?source=${source.slug}&pageSize=500`));
      expect(sourcePage?.rows.some((row) => removedKeys.has(String(row.username).toLowerCase()))).toBe(false);
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
