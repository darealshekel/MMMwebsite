import { describe, expect, it } from "vitest";
import { buildSourceRollups, selectLeaderboardWorldRollups, type WorldSourceRow, type PlayerWorldStatRow } from "../../api/_lib/source-approval";

describe("source approval visibility", () => {
  it("keeps pending servers out of public leaderboard visibility", () => {
    const worlds: WorldSourceRow[] = [
      {
        id: "private-world",
        world_key: "solo:world",
        display_name: "Solo World",
        kind: "singleplayer",
        source_scope: "private_singleplayer",
        approval_status: "approved",
      },
      {
        id: "approved-world",
        world_key: "server:a",
        display_name: "Server A",
        kind: "multiplayer",
        source_scope: "public_server",
        approval_status: "approved",
      },
      {
        id: "pending-world",
        world_key: "server:b",
        display_name: "Server B",
        kind: "multiplayer",
        source_scope: "public_server",
        approval_status: "pending",
      },
    ];

    const stats: PlayerWorldStatRow[] = [
      { player_id: "player-1", world_id: "private-world", total_blocks: 75_000, last_seen_at: "2026-04-10T10:00:00.000Z" },
      { player_id: "player-1", world_id: "approved-world", total_blocks: 100_000, last_seen_at: "2026-04-10T10:00:00.000Z" },
      { player_id: "player-1", world_id: "pending-world", total_blocks: 250_000, last_seen_at: "2026-04-10T10:00:00.000Z" },
    ];

    const rollups = buildSourceRollups(worlds, stats);
    const { globalVisible, publicVisible } = selectLeaderboardWorldRollups(rollups);

    expect(rollups).toHaveLength(3);
    expect(globalVisible.map((rollup) => rollup.id)).toEqual(["approved-world", "private-world"]);
    expect(publicVisible.map((rollup) => rollup.id)).toEqual(["approved-world"]);
  });
});
