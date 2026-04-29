import { beforeEach, describe, expect, it, vi } from "vitest";

const manualOverrideRows = vi.hoisted(() => [] as Array<{ id: string; kind: string; data: Record<string, unknown> }>);
const submissionRows = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const liveRows = vi.hoisted(() => ({
  leaderboardEntries: [] as Array<Record<string, unknown>>,
  users: [] as Array<Record<string, unknown>>,
  sources: [] as Array<Record<string, unknown>>,
  worlds: [] as Array<Record<string, unknown>>,
  aeternumRows: [] as Array<Record<string, unknown>>,
}));

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
    const updatedRow = leaderboard.rows.find((row) => String(row.playerId ?? "") === String(editedRow.playerId ?? ""));
    const expectedSourceTotal = rows.reduce((sum, row) => {
      if (String(row.playerId ?? "") === String(editedRow.playerId ?? "")) return sum + nextBlocks;
      return sum + Number(row.blocksMined ?? 0);
    }, 0);

    expect(leaderboard.source?.displayName).toBe(renamedSource);
    expect(leaderboard.publicSources[0].displayName).toBe(renamedSource);
    expect(leaderboard.publicSources[0].totalBlocks).toBe(expectedSourceTotal);
    expect(leaderboard.totalBlocks).toBe(expectedSourceTotal);
    expect(updatedRow?.blocksMined).toBe(nextBlocks);

    const publicSources = await applyStaticManualOverridesToSources([source]);
    expect(publicSources.find((candidate) => String(candidate.id ?? "") === sourceId)?.displayName).toBe(renamedSource);

    const sourcePageUrl = new URL(`https://mmm.test/api/leaderboard?source=${encodeURIComponent(String(source?.slug ?? ""))}&pageSize=100`);
    const sourcePage = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(sourcePageUrl), sourcePageUrl);
    expect(sourcePage?.title).toBe(renamedSource);
    expect(sourcePage?.source?.displayName).toBe(renamedSource);
    expect(sourcePage?.rows.find((row) => String(row.playerId ?? "") === String(editedRow.playerId ?? ""))?.sourceServer).toBe(renamedSource);

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
    const targetRow = targetLeaderboard.rows.find((row) => String(row.playerId ?? "") === playerId);
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

    const playerDetail = await applyStaticManualOverridesToPlayerDetail(buildStaticPlayerDetailResponse(new URL(`https://mmm.test/api/player-detail?slug=${encodeURIComponent(username.toLowerCase())}`)));
    expect(playerDetail?.blocksNum).toBe(dashboard?.totalBlocks);
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
