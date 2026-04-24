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
  getStaticDashboardPlayerData,
  getStaticEditableSourceRows,
  getStaticPublicSources,
} from "./static-mmm-leaderboard.js";
import {
  applyStaticManualOverridesToDashboardPlayerData,
  applyStaticManualOverridesToLeaderboardResponse,
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
});
