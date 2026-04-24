import { beforeEach, describe, expect, it, vi } from "vitest";

const manualOverrideRows = vi.hoisted(() => [] as Array<{ id: string; kind: string; data: Record<string, unknown> }>);

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
} from "./static-mmm-leaderboard.js";
import {
  applyStaticManualOverridesToDashboardPlayerData,
  applyStaticManualOverridesToLeaderboardResponse,
  applyStaticManualOverridesToPlayerDetail,
} from "./static-mmm-overrides.js";

describe("static MMM manual overrides", () => {
  beforeEach(() => {
    manualOverrideRows.length = 0;
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

    const dashboard = await applyStaticManualOverridesToDashboardPlayerData(getStaticDashboardPlayerData(String(editedRow.username ?? "")));
    const dashboardServer = dashboard?.servers.find((server) => String(server.id ?? "") === sourceId);
    expect(dashboardServer?.displayName).toBe(renamedSource);
    expect(dashboardServer?.totalBlocks).toBe(nextBlocks);
    expect(dashboard?.totalBlocks).toBeGreaterThanOrEqual(nextBlocks);
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

    const leaderboard = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(new URL(`https://mmm.test/api/leaderboard?pageSize=200&query=${encodeURIComponent(username)}`)));
    const leaderboardRow = leaderboard?.rows.find((row) => String(row.username ?? "").toLowerCase() === username.toLowerCase());
    expect(leaderboardRow?.blocksMined).toBe(dashboard?.totalBlocks);

    const playerDetail = await applyStaticManualOverridesToPlayerDetail(buildStaticPlayerDetailResponse(new URL(`https://mmm.test/api/player-detail?slug=${encodeURIComponent(username.toLowerCase())}`)));
    expect(playerDetail?.blocksNum).toBe(dashboard?.totalBlocks);
  });
});
