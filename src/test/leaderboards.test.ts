import { describe, expect, it } from "vitest";
import { buildRankedLeaderboardRows, type RankedRowInput } from "../../api/_lib/leaderboards";
import { buildSourceDisplayName, buildSourceSlug } from "../../shared/source-slug";

function buildRow(overrides: Partial<RankedRowInput>): RankedRowInput {
  return {
    playerId: overrides.playerId ?? "player-1",
    username: overrides.username ?? "PlayerOne",
    blocksMined: overrides.blocksMined ?? 100,
    lastUpdated: overrides.lastUpdated ?? "2026-04-10T10:00:00.000Z",
    sourceId: overrides.sourceId ?? null,
    sourceSlug: overrides.sourceSlug ?? null,
    sourceServer: overrides.sourceServer ?? "Main Leaderboard",
    viewKind: overrides.viewKind ?? "global",
    sourceCount: overrides.sourceCount ?? 1,
  };
}

describe("canonical leaderboard row model", () => {
  it("keeps main leaderboard rows as one combined row per player", () => {
    const rows = buildRankedLeaderboardRows([
      buildRow({
        playerId: "player-a",
        username: "PlayerA",
        blocksMined: 373_456,
        sourceCount: 2,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: "player-a",
      blocksMined: 373_456,
      sourceCount: 2,
      viewKind: "global",
      rowKey: "player-a",
    });
  });

  it("keeps source leaderboard rows isolated to their own source", () => {
    const aeternumRows = buildRankedLeaderboardRows([
      buildRow({
        playerId: "player-a",
        username: "PlayerA",
        blocksMined: 123_456,
        sourceId: "source-a",
        sourceSlug: "aeternum",
        sourceServer: "Aeternum",
        viewKind: "source",
      }),
    ]);
    const redTechRows = buildRankedLeaderboardRows([
      buildRow({
        playerId: "player-a",
        username: "PlayerA",
        blocksMined: 250_000,
        sourceId: "source-b",
        sourceSlug: "redtech",
        sourceServer: "RedTech",
        viewKind: "source",
      }),
    ]);

    expect(aeternumRows[0]).toMatchObject({
      blocksMined: 123_456,
      sourceId: "source-a",
      rowKey: "source-a-player-a",
    });
    expect(redTechRows[0]).toMatchObject({
      blocksMined: 250_000,
      sourceId: "source-b",
      rowKey: "source-b-player-a",
    });
  });

  it("does not merge different players that share a username", () => {
    const rows = buildRankedLeaderboardRows([
      buildRow({
        playerId: "player-a",
        username: "Miner",
        blocksMined: 120_000,
      }),
      buildRow({
        playerId: "player-b",
        username: "Miner",
        blocksMined: 115_000,
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.playerId)).toEqual(["player-a", "player-b"]);
  });
});

describe("source identity helpers", () => {
  it("uses canonical aeternum naming without hardcoding other sources", () => {
    expect(buildSourceSlug({ displayName: "Aeternum" })).toBe("aeternum");
    expect(buildSourceDisplayName({ displayName: "Aeternum" })).toBe("Aeternum");
    expect(buildSourceSlug({ displayName: "RedTech" })).toBe("redtech");
    expect(buildSourceDisplayName({ displayName: "RedTech" })).toBe("RedTech");
  });
});
