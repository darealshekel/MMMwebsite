import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldShowInPrivateServerDigs } from "../../shared/source-classification.js";

const manualOverrideRows = vi.hoisted(() => [] as Array<{ id: string; kind: string; data: Record<string, unknown> }>);
const submissionRows = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const liveRows = vi.hoisted(() => ({
  leaderboardEntries: [] as Array<Record<string, unknown>>,
  users: [] as Array<Record<string, unknown>>,
  sources: [] as Array<Record<string, unknown>>,
  worlds: [] as Array<Record<string, unknown>>,
  aeternumRows: [] as Array<Record<string, unknown>>,
}));
const testEnv = vi.hoisted(() => {
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  return true;
});
void testEnv;

vi.mock("./server.js", () => ({
  supabaseAdmin: {
    from(table: string) {
      if (table === "mmm_manual_overrides") {
        return {
          select() {
            return Promise.resolve({ data: manualOverrideRows, error: null });
          },
        };
      }
      if (table === "mmm_submissions") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit() {
                        return Promise.resolve({ data: submissionRows, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "leaderboard_entries") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      gt() {
                        return {
                          limit() {
                            return Promise.resolve({ data: liveRows.leaderboardEntries, error: null });
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "users") {
        return {
          select() {
            return {
              in(column: string, values: string[]) {
                const key = column === "username_lower" ? "username_lower" : "id";
                return Promise.resolve({
                  data: liveRows.users.filter((row) => values.includes(String(row[key] ?? ""))),
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === "sources") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      limit() {
                        return Promise.resolve({ data: liveRows.sources, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "worlds_or_servers") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      limit() {
                        return Promise.resolve({ data: liveRows.worlds, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "aeternum_player_stats") {
        return {
          select() {
            return {
              in(_column: string, ids: string[]) {
                return {
                  limit() {
                    return Promise.resolve({
                      data: liveRows.aeternumRows.filter((row) => ids.includes(String(row.source_world_id ?? ""))),
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "player_metadata") {
        return {
          select() {
            return {
              not() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      }
      return {
        select() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  },
}));

import {
  buildStaticLeaderboardResponse,
  buildStaticPlayerDetailResponse,
  buildStaticSpecialLeaderboardResponse,
  getStaticDashboardPlayerData,
  getStaticEditableSourceRows,
  getStaticPublicSources,
  getStaticSubmitSourcesForUsername,
} from "./static-mmm-leaderboard.js";
import {
  applyStaticManualOverridesToDashboardPlayerData,
  applyStaticManualOverridesToLeaderboardResponse,
  applyStaticManualOverridesToPlayerDetail,
  applyStaticManualOverridesToSources,
  applyStaticManualOverridesToSubmitSources,
  buildApprovedSubmissionPlayerDetailResponse,
  buildApprovedSubmissionSourceLeaderboardResponse,
  buildLandingTopSourcesFromLeaderboardData,
} from "./static-mmm-overrides.js";

describe("static MMM manual overrides", () => {
  beforeEach(() => {
    manualOverrideRows.length = 0;
    submissionRows.length = 0;
    liveRows.leaderboardEntries.length = 0;
    liveRows.users.length = 0;
    liveRows.sources.length = 0;
    liveRows.worlds.length = 0;
    liveRows.aeternumRows.length = 0;
  });

  it("propagates source rename and source-row block edits to source totals and dashboard data", async () => {
    const source = getStaticPublicSources().find((candidate) => getStaticEditableSourceRows(String(candidate.id ?? ""), "").length > 0);
    expect(source).toBeTruthy();
    const sourceId = String(source?.id ?? "");
    const rows = getStaticEditableSourceRows(sourceId, "");
    const editedRow = rows[0];
    const nextBlocks = Number(editedRow.blocksMined ?? 0) + 12345;
    const renamedSource = "Regression Test World";

    manualOverrideRows.push(
      { id: sourceId, kind: "source", data: { displayName: renamedSource, logoUrl: "/generated/test-logo.png" } },
      { id: `${sourceId}:${String(editedRow.playerId ?? "")}`, kind: "source-row", data: { blocksMined: nextBlocks } },
    );

    const leaderboard = await applyStaticManualOverridesToLeaderboardResponse({
      scope: "source",
      title: source?.displayName,
      source,
      rows,
      featuredRows: rows.slice(0, 3),
      publicSources: [source],
      totalBlocks: source?.totalBlocks,
    });
    const expectedSourceTotal = rows.reduce((sum, row) => {
      if (String(row.playerId ?? "") === String(editedRow.playerId ?? "")) return sum + nextBlocks;
      return sum + Number(row.blocksMined ?? 0);
    }, 0);

    expect(leaderboard.source?.displayName).toBe(renamedSource);
    expect(leaderboard.publicSources[0].displayName).toBe(renamedSource);
    expect(leaderboard.publicSources[0].totalBlocks).toBe(expectedSourceTotal);
    expect(leaderboard.totalBlocks).toBe(expectedSourceTotal);

    const editedRowUrl = new URL(`https://mmm.test/api/leaderboard?source=${encodeURIComponent(String(source?.slug ?? ""))}&query=${encodeURIComponent(String(editedRow.username ?? ""))}&pageSize=20`);
    const editedRowPage = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(editedRowUrl), editedRowUrl);
    const updatedRow = editedRowPage?.rows.find((row) => String(row.username ?? "").toLowerCase() === String(editedRow.username ?? "").toLowerCase());
    expect(updatedRow?.blocksMined).toBe(nextBlocks);

    const publicSources = await applyStaticManualOverridesToSources([source]);
    expect(publicSources.find((candidate) => String(candidate.id ?? "") === sourceId)?.displayName).toBe(renamedSource);

    const sourcePageUrl = new URL(`https://mmm.test/api/leaderboard?source=${encodeURIComponent(String(source?.slug ?? ""))}&pageSize=100`);
    const sourcePage = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(sourcePageUrl), sourcePageUrl);
    expect(sourcePage?.title).toBe(renamedSource);
    expect(sourcePage?.source?.displayName).toBe(renamedSource);
    expect(sourcePage?.rows.find((row) => String(row.username ?? "").toLowerCase() === String(editedRow.username ?? "").toLowerCase())?.sourceServer).toBe(renamedSource);

    const dashboard = await applyStaticManualOverridesToDashboardPlayerData(getStaticDashboardPlayerData(String(editedRow.username ?? "")));
    const dashboardServer = dashboard?.servers.find((server) => String(server.id ?? "") === sourceId);
    expect(dashboardServer?.displayName).toBe(renamedSource);
    expect(dashboardServer?.totalBlocks).toBe(nextBlocks);
    expect(dashboard?.totalBlocks).toBeGreaterThanOrEqual(nextBlocks);

    const playerDetail = await applyStaticManualOverridesToPlayerDetail(buildStaticPlayerDetailResponse(new URL(`https://mmm.test/api/player-detail?slug=${encodeURIComponent(String(editedRow.username ?? "").toLowerCase())}`)));
    const playerDetailServer = playerDetail?.servers.find((server) => String(server.sourceId ?? "") === sourceId);
    expect(playerDetailServer?.server).toBe(renamedSource);
    expect(playerDetailServer?.logoUrl).toBe("/generated/test-logo.png");

    const submitSources = await applyStaticManualOverridesToSubmitSources(getStaticSubmitSourcesForUsername(String(editedRow.username ?? "")), String(editedRow.username ?? ""));
    expect(submitSources.find((candidate) => String(candidate.sourceId ?? "") === sourceId)?.sourceName).toBe(renamedSource);
  });

  it("propagates manually added source players to leaderboards and player profiles", async () => {
    const source = getStaticPublicSources().find((candidate) => getStaticEditableSourceRows(String(candidate.id ?? ""), "").length > 0);
    expect(source).toBeTruthy();
    const sourceId = String(source?.id ?? "");
    const sourceRows = getStaticEditableSourceRows(sourceId, "");
    const addedPlayerId = "local-player:manualpublicadd";
    const addedUsername = "ManualPublicAdd";
    const addedBlocks = 43210;

    manualOverrideRows.push({
      id: `${sourceId}:${addedPlayerId}`,
      kind: "source-row",
      data: {
        added: true,
        playerId: addedPlayerId,
        username: addedUsername,
        blocksMined: addedBlocks,
        lastUpdated: "2026-05-01T00:00:00.000Z",
      },
    });

    const sourcePage = await applyStaticManualOverridesToLeaderboardResponse({
      scope: "source",
      title: source?.displayName,
      source,
      rows: sourceRows,
      featuredRows: sourceRows.slice(0, 3),
      publicSources: [source],
      totalBlocks: source?.totalBlocks,
      playerCount: source?.playerCount,
      totalRows: sourceRows.length,
    });
    expect(sourcePage.rows).toContainEqual(expect.objectContaining({
      playerId: addedPlayerId,
      username: addedUsername,
      blocksMined: addedBlocks,
    }));
    expect(sourcePage.totalBlocks).toBe(sourceRows.reduce((sum, row) => sum + Number(row.blocksMined ?? 0), 0) + addedBlocks);
    expect(sourcePage.playerCount).toBe(sourceRows.length + 1);

    const mainUrl = new URL(`https://mmm.test/api/leaderboard?pageSize=20&query=${addedUsername}`);
    const mainPage = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(mainUrl), mainUrl);
    expect(mainPage?.rows).toContainEqual(expect.objectContaining({
      playerId: addedPlayerId,
      username: addedUsername,
      blocksMined: addedBlocks,
    }));

    const detail = await buildApprovedSubmissionPlayerDetailResponse(new URL(`https://mmm.test/api/player-detail?slug=${addedUsername.toLowerCase()}`));
    expect(detail?.blocksNum).toBe(addedBlocks);
    expect(detail?.servers).toContainEqual(expect.objectContaining({
      sourceId,
      server: source?.displayName,
      blocks: addedBlocks,
    }));
  });

  it("updates player profile server count when an existing player is added to a new source", async () => {
    const mainPage = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?page=1&pageSize=5"));
    const player = mainPage?.rows[0];
    expect(player).toBeTruthy();

    const username = String(player?.username ?? "");
    const playerId = String(player?.playerId ?? `sheet:${username.toLowerCase()}`);
    const baseDetail = buildStaticPlayerDetailResponse(new URL(`https://mmm.test/api/player-detail?slug=${encodeURIComponent(username.toLowerCase())}`));
    expect(baseDetail).toBeTruthy();

    const source = getStaticPublicSources().find((candidate) =>
      !getStaticEditableSourceRows(String(candidate.id ?? ""), "")
        .some((row) => String(row.username ?? "").toLowerCase() === username.toLowerCase()),
    );
    expect(source).toBeTruthy();

    const sourceId = String(source?.id ?? "");
    const addedBlocks = 7654321;
    manualOverrideRows.push({
      id: `${sourceId}:${playerId}`,
      kind: "source-row",
      data: {
        added: true,
        playerId,
        username,
        blocksMined: addedBlocks,
        lastUpdated: "2026-05-01T00:00:00.000Z",
      },
    });

    const detail = await applyStaticManualOverridesToPlayerDetail(baseDetail);
    expect(detail?.servers).toContainEqual(expect.objectContaining({
      sourceId,
      server: source?.displayName,
      blocks: addedBlocks,
    }));
    expect(detail?.places).toBe(detail?.servers.length);
    expect(detail?.places).toBe((baseDetail?.servers.length ?? 0) + 1);
  });

  it("keeps server profile links when duplicate profile rows include stale SSP metadata", async () => {
    const detail = await applyStaticManualOverridesToPlayerDetail({
      playerId: "sheet:mixedprofile",
      name: "MixedProfile",
      rank: 1,
      slug: "mixedprofile",
      blocksNum: 300,
      avatarUrl: "",
      bio: "",
      joined: "2026",
      favoriteBlock: "",
      places: 2,
      activity: [],
      sessions: [],
      servers: [
        {
          sourceId: "special:ssp-hsp:mixedprofile:bugged-smp",
          sourceSlug: "bugged-smp",
          playerId: "sheet:mixedprofile",
          server: "Bugged SMP",
          logoUrl: null,
          sourceType: "singleplayer",
          sourceCategory: "ssp-hsp",
          sourceScope: "ssp_hsp",
          blocks: 100,
          rank: 2,
          joined: "2026",
        },
        {
          sourceId: "source-bugged-smp",
          sourceSlug: "bugged-smp",
          playerId: "sheet:mixedprofile",
          server: "Bugged SMP",
          logoUrl: null,
          sourceType: "server",
          sourceCategory: "server",
          sourceScope: "private_server_digs",
          blocks: 200,
          rank: 1,
          joined: "2026",
        },
      ],
    });

    expect(detail?.servers).toHaveLength(1);
    expect(detail?.servers[0]).toEqual(expect.objectContaining({
      sourceId: "source-bugged-smp",
      sourceSlug: "bugged-smp",
      sourceType: "server",
      sourceScope: "private_server_digs",
      blocks: 300,
      rank: 1,
    }));
  });

  it("removes unlabeled worlds from profiles that already have Narutaku SMP", async () => {
    const detail = await applyStaticManualOverridesToPlayerDetail({
      playerId: "sheet:narutakuprofile",
      name: "NarutakuProfile",
      rank: 1,
      slug: "narutakuprofile",
      blocksNum: 1500,
      avatarUrl: "",
      bio: "",
      joined: "2026",
      favoriteBlock: "",
      places: 2,
      activity: [],
      sessions: [],
      servers: [
        {
          sourceId: "private:narutaku-smp",
          sourceSlug: "ssp-hsp-sh1mo-unlabeled-world-01",
          playerId: "sheet:narutakuprofile",
          server: "Narutaku SMP",
          logoUrl: null,
          sourceType: "singleplayer",
          sourceCategory: "ssp-hsp",
          sourceScope: "ssp_hsp",
          blocks: 1000,
          rank: 1,
          joined: "2026",
        },
        {
          sourceId: "special:ssp-hsp:narutakuprofile:unlabeled-world-01",
          sourceSlug: "ssp-hsp-narutakuprofile-unlabeled-world-01",
          playerId: "sheet:narutakuprofile",
          server: "Unlabeled World 01",
          logoUrl: null,
          sourceType: "ssp",
          sourceCategory: "ssp",
          sourceScope: "ssp_hsp",
          blocks: 500,
          rank: 1,
          joined: "2026",
        },
      ],
    });

    expect(detail?.servers.map((server) => server.server)).toEqual(["Narutaku SMP"]);
    expect(detail?.servers[0]?.sourceSlug).toBe("narutaku-smp");
    expect(detail?.servers[0]?.sourceType).toBe("server");
    expect(detail?.servers[0]?.sourceCategory).toBe("server");
    expect(detail?.servers[0]?.sourceScope).toBe("private_server_digs");
    expect(detail?.blocksNum).toBe(1000);
    expect(detail?.places).toBe(1);
  });

  it("removes misspelled Unlabled World rows from players in Narutaku SMP", async () => {
    const sourceId = "special:ssp-hsp:digs:_sh1mo:individual-world-digs-01";
    const playerId = "local-player:narutakumember";
    manualOverrideRows.push(
      {
        id: sourceId,
        kind: "source",
        data: { displayName: "Narutaku SMP" },
      },
      {
        id: `${sourceId}:${playerId}`,
        kind: "source-row",
        data: { username: "NarutakuMember", playerId, blocksMined: 1200, added: true },
      },
    );

    const detail = await applyStaticManualOverridesToPlayerDetail({
      playerId: "sheet:narutakumember",
      name: "NarutakuMember",
      rank: 1,
      slug: "narutakumember",
      blocksNum: 1700,
      avatarUrl: "",
      bio: "",
      joined: "2026",
      favoriteBlock: "",
      places: 1,
      activity: [],
      sessions: [],
      servers: [
        {
          sourceId: "special:ssp-hsp:narutakumember:unlabled-world",
          sourceSlug: "ssp-hsp-narutakumember-unlabled-world",
          playerId: "sheet:narutakumember",
          server: "Unlabled World",
          logoUrl: null,
          sourceType: "ssp",
          sourceCategory: "ssp",
          sourceScope: "ssp_hsp",
          blocks: 500,
          rank: 1,
          joined: "2026",
        },
      ],
    });

    expect(detail?.servers.map((server) => server.server)).toEqual(["Narutaku SMP"]);
    expect(detail?.servers[0]?.sourceSlug).toBe("narutaku-smp");
    expect(detail?.blocksNum).toBe(1200);
    expect(detail?.places).toBe(1);
  });

  it("promotes a Narutaku SMP renamed special world into Server Digs", async () => {
    const sourceId = "special:ssp-hsp:digs:_sh1mo:individual-world-digs-01";

    manualOverrideRows.push({
      id: sourceId,
      kind: "source",
      data: { displayName: "Narutaku SMP" },
    });

    const publicSources = await applyStaticManualOverridesToSources(getStaticPublicSources());
    const narutaku = publicSources.find((source) => source.slug === "narutaku-smp");
    expect(narutaku).toMatchObject({
      displayName: "Narutaku SMP",
      sourceType: "server",
      sourceCategory: "server",
      sourceScope: "private_server_digs",
    });
    expect(shouldShowInPrivateServerDigs(narutaku)).toBe(true);

    const sourcePage = await buildApprovedSubmissionSourceLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?source=narutaku-smp&pageSize=100"));
    expect(sourcePage?.source?.slug).toBe("narutaku-smp");
    expect(sourcePage?.rows.length).toBeGreaterThan(0);
  });

  it("builds landing largest sources from effective source leaderboard totals", async () => {
    const topSources = await buildLandingTopSourcesFromLeaderboardData();
    const serverDigsTopSources = (await applyStaticManualOverridesToSources(getStaticPublicSources()))
      .filter(shouldShowInPrivateServerDigs)
      .sort((left, right) =>
        Number(right.totalBlocks ?? 0) - Number(left.totalBlocks ?? 0)
        || String(left.displayName ?? "").localeCompare(String(right.displayName ?? "")),
      )
      .slice(0, 3);

    expect(topSources).toEqual(serverDigsTopSources);
    expect(topSources.map((source) => source.displayName)).toEqual(["Sigma SMP", "Dugged", "Aeternum"]);
    for (const source of topSources) {
      const url = new URL(`https://mmm.test/api/leaderboard?source=${source.slug}&pageSize=20`);
      const sourcePage = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(url), url);
      expect(source.totalBlocks).toBe(sourcePage?.totalBlocks);
      expect(source.playerCount).toBe(sourcePage?.playerCount);
    }
  });

  it("uses the verified approved live source total when it is higher than player rows", async () => {
    liveRows.sources.push({
      id: "live-total-test-source",
      slug: "live-total-test",
      display_name: "Live Total Test",
      source_type: "server",
      is_public: true,
      is_approved: true,
    });
    liveRows.worlds.push({
      id: "live-total-test-world",
      world_key: "live-total-test",
      display_name: "Live Total Test",
      kind: "server",
      source_scope: "public_server",
      approval_status: "approved",
    });
    liveRows.users.push(
      { id: "player-a", username: "LiveA", username_lower: "livea", canonical_name: "livea" },
      { id: "player-b", username: "LiveB", username_lower: "liveb", canonical_name: "liveb" },
      { id: "player-c", username: "LiveC", username_lower: "livec", canonical_name: "livec" },
    );
    liveRows.aeternumRows.push(
      { source_world_id: "live-total-test-world", player_id: "player-a", username: "LiveA", username_lower: "livea", player_digs: 100, total_digs: 999, latest_update: "2026-05-01T00:00:00.000Z", is_fake_player: false },
      { source_world_id: "live-total-test-world", player_id: "player-b", username: "LiveB", username_lower: "liveb", player_digs: 200, total_digs: 999, latest_update: "2026-05-01T00:00:00.000Z", is_fake_player: false },
      { source_world_id: "live-total-test-world", player_id: "player-c", username: "LiveC", username_lower: "livec", player_digs: 300, total_digs: 999, latest_update: "2026-05-01T00:00:00.000Z", is_fake_player: false },
    );

    const sources = await applyStaticManualOverridesToSources(getStaticPublicSources());
    const source = sources.find((candidate) => candidate.slug === "live-total-test");

    expect(source?.playerCount).toBe(3);
    expect(source?.totalBlocks).toBe(999);

    const sourcePage = await buildApprovedSubmissionSourceLeaderboardResponse(
      new URL("https://mmm.test/api/leaderboard?source=live-total-test&pageSize=20"),
    );
    expect(sourcePage?.playerCount).toBe(3);
    expect(sourcePage?.totalBlocks).toBe(999);
    expect(sourcePage?.rows.reduce((sum, row) => sum + Number(row.blocksMined ?? 0), 0)).toBe(600);
  });

  it("keeps later source leaderboard pages populated after applying overrides", async () => {
    const source = getStaticPublicSources().find((candidate) =>
      getStaticEditableSourceRows(String(candidate.id ?? ""), "").length > 20,
    );
    expect(source).toBeTruthy();

    const url = new URL(`https://mmm.test/api/leaderboard?source=${encodeURIComponent(String(source?.slug ?? ""))}&page=2&pageSize=20`);
    const staticPage = buildStaticLeaderboardResponse(url);
    expect(staticPage?.page).toBe(2);
    expect(staticPage?.rows.length).toBe(20);

    const leaderboard = await applyStaticManualOverridesToLeaderboardResponse(staticPage, url);
    expect(leaderboard?.page).toBe(2);
    expect(leaderboard?.totalPages).toBe(staticPage?.totalPages);
    expect(leaderboard?.rows.length).toBe(20);
    expect(leaderboard?.rows.map((row) => row.username)).toEqual(staticPage?.rows.map((row) => row.username));
  });

  it("hides merged player source rows and rolls their blocks into the target source", async () => {
    const entriesByUsername = new Map<string, Array<{ source: Record<string, unknown>; row: Record<string, unknown> }>>();
    for (const source of getStaticPublicSources()) {
      for (const row of getStaticEditableSourceRows(String(source.id ?? ""), "")) {
        const username = String(row.username ?? "").toLowerCase();
        const entries = entriesByUsername.get(username) ?? [];
        entries.push({ source, row });
        entriesByUsername.set(username, entries);
      }
    }
    const playerEntries = [...entriesByUsername.values()].find((entries) => entries.length >= 2);
    expect(playerEntries).toBeTruthy();
    const [mergedEntry, targetEntry] = playerEntries!;
    const playerId = String(mergedEntry.row.playerId ?? "");
    const mergedSourceId = String(mergedEntry.source.id ?? "");
    const targetSourceId = String(targetEntry.source.id ?? "");
    const mergedBlocks = Number(mergedEntry.row.blocksMined ?? 0);
    const targetBlocks = Number(targetEntry.row.blocksMined ?? 0);
    const combinedBlocks = mergedBlocks + targetBlocks;

    manualOverrideRows.push(
      {
        id: `${mergedSourceId}:${playerId}`,
        kind: "source-row",
        data: {
          blocksMined: 0,
          hidden: true,
          mergedIntoSourceId: targetSourceId,
          mergedIntoSourceName: targetEntry.source.displayName,
        },
      },
      { id: `${targetSourceId}:${playerId}`, kind: "source-row", data: { blocksMined: combinedBlocks } },
    );

    const mergedRows = getStaticEditableSourceRows(mergedSourceId, "");
    const mergedLeaderboard = await applyStaticManualOverridesToLeaderboardResponse({
      scope: "source",
      title: mergedEntry.source.displayName,
      source: mergedEntry.source,
      rows: mergedRows,
      featuredRows: mergedRows.slice(0, 3),
      publicSources: [mergedEntry.source],
      totalBlocks: mergedEntry.source.totalBlocks,
    });
    expect(mergedLeaderboard.rows.some((row) => String(row.playerId ?? "") === playerId)).toBe(false);
    expect(mergedLeaderboard.totalBlocks).toBe(
      mergedRows
        .filter((row) => String(row.playerId ?? "") !== playerId)
        .reduce((sum, row) => sum + Number(row.blocksMined ?? 0), 0),
    );

    const targetRows = getStaticEditableSourceRows(targetSourceId, "");
    const targetLeaderboard = await applyStaticManualOverridesToLeaderboardResponse({
      scope: "source",
      title: targetEntry.source.displayName,
      source: targetEntry.source,
      rows: targetRows,
      featuredRows: targetRows.slice(0, 3),
      publicSources: [targetEntry.source],
      totalBlocks: targetEntry.source.totalBlocks,
    });
    const targetRowUrl = new URL(`https://mmm.test/api/leaderboard?source=${encodeURIComponent(String(targetEntry.source.slug ?? ""))}&query=${encodeURIComponent(String(targetEntry.row.username ?? ""))}&pageSize=20`);
    const targetRowPage = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(targetRowUrl), targetRowUrl);
    const targetRow = targetRowPage?.rows.find((row) => String(row.username ?? "").toLowerCase() === String(targetEntry.row.username ?? "").toLowerCase());
    expect(targetRow?.blocksMined).toBe(combinedBlocks);

    const dashboard = await applyStaticManualOverridesToDashboardPlayerData(getStaticDashboardPlayerData(String(mergedEntry.row.username ?? "")));
    expect(dashboard?.servers.some((server) => String(server.id ?? "") === mergedSourceId)).toBe(false);
    expect(dashboard?.servers.find((server) => String(server.id ?? "") === targetSourceId)?.totalBlocks).toBe(combinedBlocks);
  });

  it("uses source-row totals instead of stale global player overrides", async () => {
    const candidate = getStaticPublicSources()
      .flatMap((source) =>
        getStaticEditableSourceRows(String(source.id ?? ""), "")
          .map((row) => ({ source, row })),
      )
      .find(({ row }) => {
        const username = String(row.username ?? "");
        const leaderboard = buildStaticLeaderboardResponse(new URL(`https://mmm.test/api/leaderboard?pageSize=200&query=${encodeURIComponent(username)}`));
        return Boolean(leaderboard?.rows.some((leaderboardRow) => String(leaderboardRow.username ?? "").toLowerCase() === username.toLowerCase()));
      });
    expect(candidate).toBeTruthy();
    const source = candidate!.source;
    const editedRow = candidate!.row;
    const sourceId = String(source.id ?? "");
    const playerId = String(editedRow.playerId ?? "");
    const username = String(editedRow.username ?? "");
    const originalBlocks = Number(editedRow.blocksMined ?? 0);
    const nextBlocks = originalBlocks + 54321;

    manualOverrideRows.push(
      { id: playerId, kind: "single-player", data: { blocksMined: 1, flagUrl: "/generated/test-flag.png" } },
      { id: `${sourceId}:${playerId}`, kind: "source-row", data: { blocksMined: nextBlocks } },
    );

    const dashboard = await applyStaticManualOverridesToDashboardPlayerData(getStaticDashboardPlayerData(username));
    const dashboardServer = dashboard?.servers.find((server) => String(server.id ?? "") === sourceId);
    expect(dashboardServer?.totalBlocks).toBe(nextBlocks);
    expect(dashboard?.totalBlocks).not.toBe(1);

    const leaderboardUrl = new URL(`https://mmm.test/api/leaderboard?pageSize=200&query=${encodeURIComponent(username)}`);
    const leaderboard = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(leaderboardUrl), leaderboardUrl);
    const leaderboardRow = leaderboard?.rows.find((row) => String(row.username ?? "").toLowerCase() === username.toLowerCase());
    expect(leaderboardRow?.blocksMined).toBe(dashboard?.totalBlocks);
    expect(dashboard?.rank).toBe(leaderboardRow?.rank);

    const playerDetail = await applyStaticManualOverridesToPlayerDetail(buildStaticPlayerDetailResponse(new URL(`https://mmm.test/api/player-detail?slug=${encodeURIComponent(username.toLowerCase())}`)));
    expect(playerDetail?.blocksNum).toBe(dashboard?.totalBlocks);
  });

  it("deduplicates canonical player ranking rows and uses the same placement in player profiles", async () => {
    const url = new URL("https://mmm.test/api/leaderboard?pageSize=20&query=XxattilaxX_00");
    const leaderboard = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(url), url);
    const matchingRows = leaderboard?.rows.filter((row) => String(row.username ?? "").toLowerCase() === "xxattilaxx_00") ?? [];

    expect(matchingRows).toHaveLength(1);
    expect(matchingRows[0].blocksMined).toBe(10_745_000);

    const playerDetail = await applyStaticManualOverridesToPlayerDetail(
      buildStaticPlayerDetailResponse(new URL("https://mmm.test/api/player-detail?slug=xxattilaxx_00")),
    );

    expect(playerDetail?.rank).toBe(matchingRows[0].rank);
    expect(playerDetail?.blocksNum).toBe(matchingRows[0].blocksMined);
  });

  it("adds approved submitted sources to public sources and main totals", async () => {
    submissionRows.push({
      id: "approved-submission-1",
      user_id: "user-1",
      minecraft_username: "SubmittedMiner",
      submission_type: "add-new-source",
      target_source_id: null,
      target_source_slug: null,
      source_name: "Approved Test Server",
      source_type: "private-server",
      submitted_blocks_mined: 30,
      logo_url: null,
      payload: {
        playerRows: [
          { username: "SubmittedMiner", blocksMined: 10 },
          { username: "OtherMiner", blocksMined: 20 },
        ],
      },
      status: "approved",
      created_at: "2026-04-24T00:00:00.000Z",
    });

    const url = new URL("https://mmm.test/api/leaderboard?pageSize=200&query=SubmittedMiner");
    const leaderboard = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(url), url);
    expect(leaderboard?.rows.find((row) => row.username === "SubmittedMiner")?.blocksMined).toBe(10);
    expect(leaderboard?.rows.every((row) => String(row.username ?? "").toLowerCase().includes("submittedminer"))).toBe(true);
    expect(leaderboard?.publicSources.some((source) => source.displayName === "Approved Test Server")).toBe(true);

    const playerDetail = await buildApprovedSubmissionPlayerDetailResponse(new URL("https://mmm.test/api/player-detail?slug=submittedminer"));
    expect(playerDetail?.servers).toContainEqual(expect.objectContaining({
      server: "Approved Test Server",
      blocks: 10,
    }));
  });

  it("merges partial live rows with all approved source moderation rows", async () => {
    const playerRows = Array.from({ length: 24 }, (_, index) => ({
      username: `ModerationMiner${String(index + 1).padStart(2, "0")}`,
      blocksMined: 2_400 - index,
    }));
    submissionRows.push({
      id: "approved-large-moderation-source",
      user_id: "user-large",
      minecraft_username: "ModerationMiner01",
      submission_type: "add-new-source",
      target_source_id: null,
      target_source_slug: null,
      source_name: "Large Moderation Server",
      source_type: "server",
      submitted_blocks_mined: playerRows.reduce((sum, row) => sum + row.blocksMined, 0),
      logo_url: null,
      payload: { playerRows },
      status: "approved",
      created_at: "2026-04-24T00:00:00.000Z",
    });
    liveRows.sources.push({
      id: "live-large-moderation-source",
      slug: "large-moderation-server",
      display_name: "Large Moderation Server",
      source_type: "server",
      is_public: true,
      is_approved: true,
    });
    liveRows.users.push(
      { id: "live-moderation-1", username: "ModerationMiner01", username_lower: "moderationminer01" },
      { id: "live-moderation-2", username: "ModerationMiner02", username_lower: "moderationminer02" },
    );
    liveRows.leaderboardEntries.push(
      {
        player_id: "live-moderation-1",
        score: 2_400,
        updated_at: "2026-04-26T10:00:00.000Z",
        source_id: "live-large-moderation-source",
        sources: liveRows.sources[0],
      },
      {
        player_id: "live-moderation-2",
        score: 2_399,
        updated_at: "2026-04-26T10:01:00.000Z",
        source_id: "live-large-moderation-source",
        sources: liveRows.sources[0],
      },
    );

    const leaderboard = await buildApprovedSubmissionSourceLeaderboardResponse(
      new URL("https://mmm.test/api/leaderboard?source=large-moderation-server&pageSize=50"),
    );

    expect(leaderboard?.totalRows).toBe(24);
    expect(leaderboard?.playerCount).toBe(24);
    expect(leaderboard?.rows).toHaveLength(24);
    expect(leaderboard?.rows).toContainEqual(expect.objectContaining({
      username: "ModerationMiner24",
      blocksMined: 2_377,
    }));
    expect(leaderboard?.totalBlocks).toBe(playerRows.reduce((sum, row) => sum + row.blocksMined, 0));
  });

  it("normalizes approved SSP submissions into SSP World rows", async () => {
    submissionRows.push({
      id: "approved-ssp-submission",
      user_id: "user-ssp",
      minecraft_username: "5hekel",
      submission_type: "add-new-source",
      target_source_id: null,
      target_source_slug: null,
      source_name: "SSP",
      source_type: "server",
      submitted_blocks_mined: 1_600_000,
      logo_url: null,
      payload: {},
      status: "approved",
      created_at: "2026-04-24T00:00:00.000Z",
    });

    const url = new URL("https://mmm.test/api/leaderboard-special?kind=ssp&pageSize=20&query=5hekel");
    const leaderboard = await applyStaticManualOverridesToLeaderboardResponse(buildStaticSpecialLeaderboardResponse(url), url);
    const row = leaderboard?.rows.find((candidate) => String(candidate.username ?? "").toLowerCase() === "5hekel");
    expect(row).toEqual(expect.objectContaining({
      blocksMined: 1_600_000,
      sourceServer: "SSP World",
    }));

    const playerDetail = await buildApprovedSubmissionPlayerDetailResponse(new URL("https://mmm.test/api/player-detail?slug=5hekel"));
    expect(playerDetail?.servers).toContainEqual(expect.objectContaining({
      server: "SSP World",
      logoUrl: "/generated/mmm-source-logos/53af69d6f765a123be8e19bb6486fca6.png",
      blocks: 1_600_000,
    }));
  });

  it("adds approved canonical HSP submissions to the HSP leaderboard and profile stats", async () => {
    submissionRows.push({
      id: "approved-hsp-submission",
      user_id: "user-hsp",
      minecraft_username: "HspSubmissionMiner",
      submission_type: "add-new-source",
      target_source_id: null,
      target_source_slug: null,
      source_name: "HSP Trial World",
      source_type: "hsp",
      submitted_blocks_mined: 581_000,
      logo_url: null,
      payload: {
        playerRows: [{ username: "HspSubmissionMiner", blocksMined: 581_000 }],
      },
      status: "approved",
      created_at: "2026-04-24T00:00:00.000Z",
    });

    const url = new URL("https://mmm.test/api/leaderboard-special?kind=hsp&pageSize=20&query=HspSubmissionMiner");
    const leaderboard = await applyStaticManualOverridesToLeaderboardResponse(buildStaticSpecialLeaderboardResponse(url), url);
    const row = leaderboard?.rows.find((candidate) => String(candidate.username ?? "") === "HspSubmissionMiner");
    expect(row).toEqual(expect.objectContaining({
      blocksMined: 581_000,
      sourceServer: "HSP Trial World",
    }));

    const playerDetail = await buildApprovedSubmissionPlayerDetailResponse(new URL("https://mmm.test/api/player-detail?slug=hspsubmissionminer"));
    expect(playerDetail?.servers).toContainEqual(expect.objectContaining({
      server: "HSP Trial World",
      blocks: 581_000,
    }));
  });

  it("paginates Player Digs after approved submitted players extend the static row count", async () => {
    submissionRows.push({
      id: "approved-tail-submission",
      user_id: "user-tail",
      minecraft_username: "TailMiner001",
      submission_type: "add-new-source",
      target_source_id: null,
      target_source_slug: null,
      source_name: "Approved Tail Server",
      source_type: "private-server",
      submitted_blocks_mined: 1830,
      logo_url: null,
      payload: {
        playerRows: Array.from({ length: 60 }, (_, index) => ({
          username: `TailMiner${String(index + 1).padStart(3, "0")}`,
          blocksMined: index + 1,
        })),
      },
      status: "approved",
      created_at: "2026-04-24T00:00:00.000Z",
    });

    const pageSize = 20;
    const firstPage = buildStaticLeaderboardResponse(new URL(`https://mmm.test/api/leaderboard?page=1&pageSize=${pageSize}`));
    const requestedPage = Number(firstPage?.totalPages ?? 1) + 1;
    const url = new URL(`https://mmm.test/api/leaderboard?page=${requestedPage}&pageSize=${pageSize}`);
    const staticPage = buildStaticLeaderboardResponse(url);
    expect(staticPage?.page).toBeLessThan(requestedPage);

    const leaderboard = await applyStaticManualOverridesToLeaderboardResponse(staticPage, url);
    expect(leaderboard?.page).toBe(requestedPage);
    expect(leaderboard?.totalPages).toBeGreaterThanOrEqual(requestedPage);
    expect(leaderboard?.totalRows).toBeGreaterThan(Number(firstPage?.totalRows ?? 0));
    expect(leaderboard?.rows.length).toBeGreaterThan(0);
  });

  it("preserves a static source logo when a metadata override has no replacement logo", async () => {
    const source = getStaticPublicSources().find((candidate) => candidate.logoUrl);
    expect(source).toBeTruthy();
    const sourceId = String(source?.id ?? "");

    manualOverrideRows.push({
      id: sourceId,
      kind: "source",
      data: { displayName: "Logo Preserve Regression", logoUrl: null },
    });

    const publicSources = await applyStaticManualOverridesToSources([source!]);
    expect(publicSources.find((candidate) => String(candidate.id ?? "") === sourceId)?.logoUrl).toBe(source?.logoUrl);
  });

  it("merges approved live canonical rows with scoreboard rows instead of replacing them", async () => {
    liveRows.sources.push({
      id: "live-source",
      slug: "future-source",
      display_name: "Future Source",
      source_type: "server",
      is_public: true,
      is_approved: true,
    });
    liveRows.worlds.push({
      id: "world-source",
      world_key: "future.example",
      display_name: "Future Source",
      kind: "multiplayer",
      host: null,
      source_scope: "public_server",
      approval_status: "approved",
    });
    liveRows.users.push(
      { id: "player-one", username: "MinerOne", username_lower: "minerone" },
      { id: "player-two", username: "MinerTwo", username_lower: "minertwo" },
      { id: "player-three", username: "MinerThree", username_lower: "minerthree" },
      { id: "placeholder-player", username: "Player", username_lower: "player" },
    );
    liveRows.leaderboardEntries.push(
      {
        player_id: "player-one",
        score: 150,
        updated_at: "2026-04-26T10:00:00.000Z",
        source_id: "live-source",
        sources: liveRows.sources[0],
      },
      {
        player_id: "player-two",
        score: 50,
        updated_at: "2026-04-26T10:01:00.000Z",
        source_id: "live-source",
        sources: liveRows.sources[0],
      },
      {
        player_id: "placeholder-player",
        score: 150,
        updated_at: "2026-04-26T10:01:30.000Z",
        source_id: "live-source",
        sources: liveRows.sources[0],
      },
    );
    liveRows.aeternumRows.push(
      {
        source_world_id: "world-source",
        player_id: "player-one",
        username: "MinerOne",
        username_lower: "minerone",
        player_digs: 100,
        total_digs: 0,
        latest_update: "2026-04-26T10:02:00.000Z",
        is_fake_player: false,
      },
      {
        source_world_id: "world-source",
        player_id: "player-three",
        username: "MinerThree",
        username_lower: "minerthree",
        player_digs: 25,
        total_digs: 0,
        latest_update: "2026-04-26T10:03:00.000Z",
        is_fake_player: false,
      },
    );

    const sources = await applyStaticManualOverridesToSources([]);
    const source = sources.find((candidate) => candidate.slug === "future-source");

    expect(source).toEqual(expect.objectContaining({
      id: "live-source",
      totalBlocks: 225,
      playerCount: 3,
    }));
    expect(source?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: "MinerOne", blocksMined: 150 }),
      expect.objectContaining({ username: "MinerTwo", blocksMined: 50 }),
      expect.objectContaining({ username: "MinerThree", blocksMined: 25 }),
    ]));
    expect(source?.rows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ username: "Player" }),
    ]));
  });
});
