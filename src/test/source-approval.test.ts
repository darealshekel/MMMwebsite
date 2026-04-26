import { describe, expect, it, vi } from "vitest";
import {
  buildSourceRollups,
  isValidAeternumPlayerStat,
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
        samplePlayerNames: ["player-1"],
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
        samplePlayerNames: ["player-1", "player-2", "player-3"],
      }],
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const [rollup] = buildSourceRollups(worlds, stats, aeternumAggregates);

    expect(rollup.totalBlocks).toBe(20_000);
    expect(rollup.playerCount).toBe(3);
    expect(warnSpy).toHaveBeenCalledWith("[source-approval] verified source total differs from player sum", expect.objectContaining({
      verifiedSourceTotal: 20_000,
      calculatedApprovedTotal: 20_000,
      perPlayerSum: 12_000,
    }));
    warnSpy.mockRestore();
  });

  it("uses verified in-game source totals for multiplayer source totals without changing player sums", () => {
    const worlds: WorldSourceRow[] = [
      {
        id: "aeternum",
        world_key: "mc.aeternumsmp.net",
        display_name: "Aeternum",
        kind: "multiplayer",
        source_scope: "public_server",
        approval_status: "approved",
      },
    ];

    const aeternumAggregates = new Map<string, AeternumAggregate>([
      ["aeternum", {
        playerCount: 2,
        leaderboardRowCount: 2,
        serverTotal: 105_000,
        realPlayerSum: 100_000,
        samplePlayerNames: ["MinerOne", "MinerTwo"],
      }],
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const [rollup] = buildSourceRollups(worlds, [], aeternumAggregates);

    expect(rollup.totalBlocks).toBe(105_000);
    expect(rollup.playerCount).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith("[source-approval] verified source total differs from player sum", expect.objectContaining({
      verifiedSourceTotal: 105_000,
      calculatedApprovedTotal: 105_000,
      perPlayerSum: 100_000,
    }));
    warnSpy.mockRestore();
  });

  it("validates scoreboard player rows before they can affect source totals", () => {
    expect(isValidAeternumPlayerStat({
      usernameLower: "5hekel",
      playerDigs: 2_179_162,
      serverTotal: 237_078_005,
      isFakePlayer: false,
    })).toBe(true);

    expect(isValidAeternumPlayerStat({
      usernameLower: "tp20",
      playerDigs: 100_000,
      serverTotal: 237_078_005,
      isFakePlayer: false,
    })).toBe(false);

    expect(isValidAeternumPlayerStat({
      usernameLower: "realplayer",
      playerDigs: 300_000_000,
      serverTotal: 237_078_005,
      isFakePlayer: false,
    })).toBe(false);
  });
});
