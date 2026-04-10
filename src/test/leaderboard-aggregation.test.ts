import { describe, expect, it } from "vitest";
import { aggregateLeaderboardViews } from "@/lib/leaderboard-aggregation";
import { buildLatestAeternumSnapshot } from "../../api/_lib/leaderboard";

describe("aggregateLeaderboardViews", () => {
  it("keeps a single-source player on the global leaderboard", () => {
    const views = aggregateLeaderboardViews([
      {
        username: "SoloMiner",
        playerId: "player-1",
        sourceKey: "world:solo",
        sourceLabel: "Solo World",
        sourceKind: "world",
        blocksMined: 120_000,
        lastUpdated: "2026-04-09T10:00:00.000Z",
      },
    ]);

    expect(views[0].key).toBe("global");
    expect(views[0].rows[0]).toMatchObject({
      username: "SoloMiner",
      blocksMined: 120_000,
      sourceCount: 1,
      rank: 1,
    });
  });

  it("combines one player across multiple sources on the global leaderboard", () => {
    const views = aggregateLeaderboardViews([
      {
        username: "PlayerA",
        playerId: "player-a",
        minecraftUuidHash: "uuid-a",
        sourceKey: "world:one",
        sourceLabel: "Server One",
        sourceKind: "world",
        blocksMined: 120_000,
        lastUpdated: "2026-04-09T10:00:00.000Z",
      },
      {
        username: "PlayerA",
        playerId: "player-a",
        minecraftUuidHash: "uuid-a",
        sourceKey: "aeternum:aeternum",
        sourceLabel: "Aeternum",
        sourceKind: "aeternum",
        blocksMined: 80_000,
        lastUpdated: "2026-04-09T11:00:00.000Z",
      },
    ]);

    const globalRow = views[0].rows[0];
    const aeternumView = views.find((view) => view.key === "aeternum:aeternum");
    const worldView = views.find((view) => view.key === "world:one");

    expect(globalRow.blocksMined).toBe(200_000);
    expect(globalRow.sourceCount).toBe(2);
    expect(aeternumView?.rows[0].blocksMined).toBe(80_000);
    expect(worldView?.rows[0].blocksMined).toBe(120_000);
  });

  it("uses authoritative source totals for view totals without changing player totals", () => {
    const views = aggregateLeaderboardViews(
      [
        {
          username: "PlayerA",
          playerId: "player-a",
          sourceKey: "aeternum:aeternum",
          sourceLabel: "Aeternum",
          sourceKind: "aeternum",
          blocksMined: 120,
          lastUpdated: "2026-04-09T10:00:00.000Z",
        },
        {
          username: "PlayerB",
          playerId: "player-b",
          sourceKey: "aeternum:aeternum",
          sourceLabel: "Aeternum",
          sourceKind: "aeternum",
          blocksMined: 80,
          lastUpdated: "2026-04-09T10:00:00.000Z",
        },
      ],
      new Map([
        ["aeternum:aeternum", { totalBlocks: 155 }],
      ]),
    );

    const globalView = views.find((view) => view.key === "global");
    const aeternumView = views.find((view) => view.key === "aeternum:aeternum");

    expect(globalView?.rows.map((row) => row.blocksMined)).toEqual([120, 80]);
    expect(aeternumView?.rows.map((row) => row.blocksMined)).toEqual([120, 80]);
    expect(aeternumView?.totalBlocks).toBe(155);
    expect(globalView?.totalBlocks).toBe(200);
  });

  it("does not merge players with the same username when identities differ", () => {
    const views = aggregateLeaderboardViews([
      {
        username: "Miner",
        playerId: "player-1",
        minecraftUuidHash: "uuid-1",
        sourceKey: "world:a",
        sourceLabel: "World A",
        sourceKind: "world",
        blocksMined: 90_000,
        lastUpdated: "2026-04-09T10:00:00.000Z",
      },
      {
        username: "Miner",
        playerId: "player-2",
        minecraftUuidHash: "uuid-2",
        sourceKey: "world:b",
        sourceLabel: "World B",
        sourceKind: "world",
        blocksMined: 110_000,
        lastUpdated: "2026-04-09T10:05:00.000Z",
      },
    ]);

    expect(views[0].rows).toHaveLength(2);
    expect(views[0].rows[0].blocksMined).toBe(110_000);
    expect(views[0].rows[1].blocksMined).toBe(90_000);
  });

  it("does not double count duplicate records from the same source", () => {
    const views = aggregateLeaderboardViews([
      {
        username: "PlayerA",
        playerId: "player-a",
        sourceKey: "world:dup",
        sourceLabel: "Duplicate World",
        sourceKind: "world",
        blocksMined: 20_000,
        lastUpdated: "2026-04-09T10:00:00.000Z",
      },
      {
        username: "PlayerA",
        playerId: "player-a",
        sourceKey: "world:dup",
        sourceLabel: "Duplicate World",
        sourceKind: "world",
        blocksMined: 25_000,
        lastUpdated: "2026-04-09T11:00:00.000Z",
      },
    ]);

    expect(views[0].rows[0].blocksMined).toBe(25_000);
    expect(views.find((view) => view.key === "world:dup")?.rows[0].blocksMined).toBe(25_000);
  });

  it("assigns tied ranks using competition ranking", () => {
    const views = aggregateLeaderboardViews([
      {
        username: "Alpha",
        playerId: "alpha",
        sourceKey: "world:a",
        sourceLabel: "World A",
        sourceKind: "world",
        blocksMined: 50_000,
        lastUpdated: "2026-04-09T10:00:00.000Z",
      },
      {
        username: "Beta",
        playerId: "beta",
        sourceKey: "world:b",
        sourceLabel: "World B",
        sourceKind: "world",
        blocksMined: 50_000,
        lastUpdated: "2026-04-09T10:00:00.000Z",
      },
      {
        username: "Gamma",
        playerId: "gamma",
        sourceKey: "world:c",
        sourceLabel: "World C",
        sourceKind: "world",
        blocksMined: 40_000,
        lastUpdated: "2026-04-09T10:00:00.000Z",
      },
    ]);

    expect(views[0].rows.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it("can include a private contribution in global totals without creating a source view", () => {
    const views = aggregateLeaderboardViews(
      [
        {
          username: "SoloPlayer",
          playerId: "solo",
          sourceKey: "world:private",
          sourceLabel: "My Survival World",
          sourceKind: "world",
          blocksMined: 45_000,
          lastUpdated: "2026-04-09T12:00:00.000Z",
          includeSourceView: false,
        },
      ],
      new Map([["world:private", { totalBlocks: 45_000 }]]),
    );

    expect(views.find((view) => view.key === "global")?.rows[0].blocksMined).toBe(45_000);
    expect(views.find((view) => view.key === "global")?.totalBlocks).toBe(45_000);
    expect(views.some((view) => view.key === "world:private")).toBe(false);
  });

  it("keeps all Aeternum players when one player receives a newer incremental update", () => {
    const snapshot = buildLatestAeternumSnapshot([
      {
        username: "PlayerA",
        username_lower: "playera",
        player_digs: 100,
        total_digs: 500,
        server_name: "Aeternum",
        latest_update: "2026-04-10T10:00:00.000Z",
      },
      {
        username: "PlayerB",
        username_lower: "playerb",
        player_digs: 80,
        total_digs: 500,
        server_name: "Aeternum",
        latest_update: "2026-04-10T10:00:00.000Z",
      },
      {
        username: "PlayerA",
        username_lower: "playera",
        player_digs: 110,
        total_digs: 510,
        server_name: "Aeternum",
        latest_update: "2026-04-10T10:05:00.000Z",
      },
    ]);

    expect(snapshot.latestRows).toHaveLength(2);
    expect(snapshot.latestRows.map((row) => row.username).sort()).toEqual(["PlayerA", "PlayerB"]);
    expect(snapshot.latestRows.find((row) => row.username === "PlayerA")?.player_digs).toBe(110);
    expect(snapshot.latestRows.find((row) => row.username === "PlayerB")?.player_digs).toBe(80);
    expect(snapshot.sourceTotals.get("aeternum:aeternum")?.totalBlocks).toBe(190);
  });
});
