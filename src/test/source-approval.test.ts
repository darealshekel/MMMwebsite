import { describe, expect, it } from "vitest";
import {
  buildSourceRollups,
  selectLeaderboardWorldRollups,
  type AeternumAggregate,
  type PlayerWorldStatRow,
  type WorldSourceRow,
} from "../../api/_lib/source-approval";

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

  it("keeps singleplayer approval totals on mod-tracked data when scoreboard rows exceed real players", () => {
    const worlds: WorldSourceRow[] = [
      {
        id: "kona",
        world_key: "kona_maailma",
        display_name: "Kona maailma",
        kind: "singleplayer",
        source_scope: "private_singleplayer",
        approval_status: "pending",
      },
    ];

    const stats: PlayerWorldStatRow[] = [
      { player_id: "player-1", world_id: "kona", total_blocks: 75_281_658, last_seen_at: "2026-04-13T10:00:00.000Z" },
    ];

    const aeternumAggregates = new Map<string, AeternumAggregate>([
      ["kona", {
        playerCount: 1,
        leaderboardRowCount: 4,
        serverTotal: 94_618_566,
        realPlayerSum: 94_618_566,
      }],
    ]);

    const [rollup] = buildSourceRollups(worlds, stats, aeternumAggregates);

    expect(rollup.totalBlocks).toBe(75_281_658);
    expect(rollup.playerCount).toBe(1);
  });

  it("uses visible valid scoreboard rows for multiplayer player counts", () => {
    const worlds: WorldSourceRow[] = [
      {
        id: "server-world",
        world_key: "server:a",
        display_name: "Server A",
        kind: "multiplayer",
        source_scope: "public_server",
        approval_status: "pending",
      },
    ];

    const stats: PlayerWorldStatRow[] = [
      { player_id: "player-1", world_id: "server-world", total_blocks: 5_000, last_seen_at: "2026-04-13T10:00:00.000Z" },
    ];

    const aeternumAggregates = new Map<string, AeternumAggregate>([
      ["server-world", {
        playerCount: 1,
        leaderboardRowCount: 3,
        serverTotal: 20_000,
        realPlayerSum: 12_000,
      }],
    ]);

    const [rollup] = buildSourceRollups(worlds, stats, aeternumAggregates);

    expect(rollup.totalBlocks).toBe(20_000);
    expect(rollup.playerCount).toBe(3);
  });
});
