import { describe, expect, it } from "vitest";
import {
  cleanPlayerDisplayName,
  createLocalAdminState,
  normalizeCanonicalPlayerName,
} from "../../tools/local-admin-state.mjs";

function createState(rows: Array<{ username: string; blocksMined: number }> = []) {
  return createLocalAdminState({
    spreadsheetSnapshot: {
      sources: rows.length
        ? [
            {
              id: "source-aeternum",
              slug: "aeternum",
              displayName: "Aeternum",
              sourceType: "server",
              logoUrl: null,
              totalBlocks: rows.reduce((sum, row) => sum + row.blocksMined, 0),
              isDead: false,
              sourceScope: "public_server",
              hasSpreadsheetTotal: false,
              rows: rows.map((row) => ({
                ...row,
                lastUpdated: "2026-04-28T00:00:00.000Z",
                playerFlagUrl: null,
              })),
            },
          ]
        : [],
      specialLeaderboards: {},
    },
    publicSources: [],
    mainRows: rows.map((row) => ({
      playerId: `local-player:${normalizeCanonicalPlayerName(row.username)}`,
      username: row.username,
      skinFaceUrl: "",
      playerFlagUrl: null,
      lastUpdated: "2026-04-28T00:00:00.000Z",
      blocksMined: row.blocksMined,
      totalDigs: row.blocksMined,
      rank: 1,
      sourceServer: "Aeternum",
      sourceKey: `global:${normalizeCanonicalPlayerName(row.username)}`,
      sourceCount: 1,
      viewKind: "global",
      sourceId: "source-aeternum",
      sourceSlug: "aeternum",
      rowKey: `global:${normalizeCanonicalPlayerName(row.username)}`,
    })),
    adminSources: [],
    viewer: {
      userId: "local-owner",
      username: "5hekel",
      avatarUrl: "",
      provider: "local-dev",
      role: "owner",
      isAdmin: true,
    },
  });
}

describe("local canonical player identity", () => {
  it("normalizes casing, whitespace, invisible characters, and the (new) suffix", () => {
    expect(cleanPlayerDisplayName("  Player   (new) ")).toBe("Player");
    expect(normalizeCanonicalPlayerName(" PLAYER ")).toBe("player");
    expect(normalizeCanonicalPlayerName("Pla\u200Byer (NEW)")).toBe("player");
  });

  it("seeds duplicate profile names into one canonical player and one source row", () => {
    const state = createState([
      { username: "Player", blocksMined: 100 },
      { username: " player ", blocksMined: 150 },
      { username: "PLAYER (new)", blocksMined: 150 },
    ]);

    const diagnostics = state.getIdentityDiagnostics();
    const players = diagnostics.players.filter((player) => player.canonicalName === "player");
    expect(players).toHaveLength(1);
    expect(players[0]).toEqual(expect.objectContaining({
      username: "Player",
      canonical_name: "player",
    }));

    const sourceRows = state.getSourceRows("aeternum") ?? [];
    expect(sourceRows.filter((row) => row.username.toLowerCase() === "player")).toHaveLength(1);
    expect(sourceRows[0].blocksMined).toBe(150);
    expect(state.getPublicSources().find((source) => source.slug === "aeternum")?.totalBlocks).toBe(150);
    expect(JSON.stringify(diagnostics)).not.toContain("(new)");
  });

  it("resolves repeated syncs across current and future sources to one profile", () => {
    const state = createState();

    const first = state.applySyncContribution({
      sourceName: "Aeternum",
      sourceType: "server",
      username: "Player",
      blocksMined: 100,
    });
    const duplicate = state.applySyncContribution({
      sourceName: "Aeternum",
      sourceType: "server",
      username: " PLAYER (new)",
      blocksMined: 250,
    });
    const futureSource = state.applySyncContribution({
      sourceName: "Future Server",
      sourceType: "server",
      username: "player",
      blocksMined: 400,
    });

    expect(first.player.playerId).toBe(duplicate.player.playerId);
    expect(futureSource.player.playerId).toBe(first.player.playerId);
    expect(state.getIdentityDiagnostics().players.filter((player) => player.canonicalName === "player")).toHaveLength(1);
    expect(state.getSourceRows("aeternum")?.filter((row) => row.playerId === first.player.playerId)).toHaveLength(1);
    expect(state.getSourceRows("aeternum")?.[0].blocksMined).toBe(250);
    expect(state.listEditableSinglePlayerSources(first.player.playerId, "").rows).toHaveLength(2);
  });

  it("uses the resolver for owner direct-add source rows", () => {
    const state = createState();

    state.createDirectSource({
      actorRole: "owner",
      sourceName: "Direct Source",
      sourceType: "server",
      playerRows: [
        { username: "Miner", blocksMined: 100 },
        { username: "miner (new)", blocksMined: 180 },
      ],
      reason: "identity test",
    });

    const sourceRows = state.getSourceRows("direct-source") ?? [];
    expect(sourceRows).toHaveLength(1);
    expect(sourceRows[0]).toEqual(expect.objectContaining({
      username: "Miner",
      blocksMined: 180,
    }));
    expect(state.getIdentityDiagnostics().players.filter((player) => player.canonicalName === "miner")).toHaveLength(1);
  });

  it("keeps local manual editor player totals identical to the leaderboard while listing SSP/HSP source rows", () => {
    const state = createLocalAdminState({
      spreadsheetSnapshot: {
        sources: [
          {
            id: "source-normal",
            slug: "normal-source",
            displayName: "Normal Source",
            sourceType: "server",
            logoUrl: null,
            totalBlocks: 100,
            isDead: false,
            sourceScope: "public_server",
            hasSpreadsheetTotal: false,
            rows: [
              {
                username: "SSPMiner",
                blocksMined: 100,
                lastUpdated: "2026-04-28T00:00:00.000Z",
                playerFlagUrl: null,
              },
            ],
          },
        ],
        specialLeaderboards: {
          "ssp-hsp": {
            sources: [
              {
                id: "special:ssp-hsp:digs:sspminer:world-one",
                slug: "ssp-hsp-sspminer-world-one",
                displayName: "World One",
                sourceType: "singleplayer",
                logoUrl: null,
                totalBlocks: 300,
                isDead: false,
                sourceScope: "ssp_hsp",
                hasSpreadsheetTotal: false,
                rows: [
                  {
                    username: "SSPMiner",
                    blocksMined: 300,
                    lastUpdated: "2026-04-28T00:00:00.000Z",
                    playerFlagUrl: null,
                  },
                ],
              },
            ],
          },
        },
      },
      publicSources: [],
      mainRows: [
        {
          playerId: "local-player:sspminer",
          username: "SSPMiner",
          skinFaceUrl: "",
          playerFlagUrl: null,
          lastUpdated: "2026-04-28T00:00:00.000Z",
          blocksMined: 100,
          totalDigs: 100,
          rank: 1,
          sourceServer: "Normal Source",
          sourceKey: "global:sspminer",
          sourceCount: 1,
          viewKind: "global",
          sourceId: "source-normal",
          sourceSlug: "normal-source",
          rowKey: "global:sspminer",
        },
      ],
      adminSources: [],
      viewer: {
        userId: "local-owner",
        username: "5hekel",
        avatarUrl: "",
        provider: "local-dev",
        role: "owner",
        isAdmin: true,
      },
    });

    const player = state.listEditableSinglePlayers("SSPMiner").players[0];
    expect(player).toEqual(expect.objectContaining({
      username: "SSPMiner",
      blocksMined: 100,
      sourceCount: 1,
    }));

    const sources = state.listEditableSinglePlayerSources(player.playerId, "").rows;
    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "special:ssp-hsp:digs:sspminer:world-one",
        sourceName: "World One",
        blocksMined: 300,
      }),
      expect.objectContaining({
        sourceId: "source-normal",
        sourceName: "Normal Source",
        blocksMined: 100,
      }),
    ]));
  });

  it("merges manual editor renames into the existing canonical player instead of creating duplicates", () => {
    const state = createState([
      { username: "Miner", blocksMined: 100 },
      { username: "OtherMiner", blocksMined: 60 },
    ]);

    state.updateSourcePlayer({
      actorRole: "owner",
      sourceId: "source-aeternum",
      playerId: "local-player:otherminer",
      username: "Miner (new)",
      blocksMined: 60,
      reason: "merge duplicate",
    });

    const sourceRows = state.getSourceRows("aeternum") ?? [];
    expect(sourceRows).toHaveLength(1);
    expect(sourceRows[0]).toEqual(expect.objectContaining({
      username: "Miner",
      blocksMined: 100,
    }));
    expect(state.getPublicSources().find((source) => source.slug === "aeternum")?.totalBlocks).toBe(100);
    expect(state.getIdentityDiagnostics().players.filter((player) => player.canonicalName === "miner")).toHaveLength(1);
    expect(state.getIdentityDiagnostics().players.some((player) => player.username.includes("(new)"))).toBe(false);
  });

  it("persists local manual editor source renames and merges same-player duplicate source names", () => {
    const state = createLocalAdminState({
      spreadsheetSnapshot: {
        sources: [
          {
            id: "source-world-one",
            slug: "world-one",
            displayName: "World One",
            sourceType: "singleplayer",
            logoUrl: null,
            totalBlocks: 100,
            isDead: false,
            sourceScope: "private_singleplayer",
            hasSpreadsheetTotal: false,
            rows: [{ username: "Miner", blocksMined: 100, lastUpdated: "2026-04-28T00:00:00.000Z" }],
          },
          {
            id: "source-world-two",
            slug: "world-two",
            displayName: "World Two",
            sourceType: "singleplayer",
            logoUrl: null,
            totalBlocks: 50,
            isDead: false,
            sourceScope: "private_singleplayer",
            hasSpreadsheetTotal: false,
            rows: [{ username: "Miner", blocksMined: 50, lastUpdated: "2026-04-28T00:00:00.000Z" }],
          },
        ],
        specialLeaderboards: {},
      },
      publicSources: [],
      mainRows: [
        {
          playerId: "local-player:miner",
          username: "Miner",
          skinFaceUrl: "",
          playerFlagUrl: null,
          lastUpdated: "2026-04-28T00:00:00.000Z",
          blocksMined: 150,
          totalDigs: 150,
          rank: 1,
          sourceServer: "World One",
          sourceKey: "global:miner",
          sourceCount: 2,
          viewKind: "global",
          sourceId: "source-world-one",
          sourceSlug: "world-one",
          rowKey: "global:miner",
        },
      ],
      adminSources: [],
      viewer: {
        userId: "local-owner",
        username: "5hekel",
        avatarUrl: "",
        provider: "local-dev",
        role: "owner",
        isAdmin: true,
      },
    });

    state.updateSourcePlayer({
      actorRole: "owner",
      sourceId: "source-world-one",
      playerId: "local-player:miner",
      username: "Miner",
      sourceName: "Renamed World",
      blocksMined: 100,
      reason: "rename",
    });
    expect(state.listEditableSinglePlayerSources("local-player:miner", "").rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "source-world-one", sourceName: "Renamed World", blocksMined: 100 }),
    ]));
    expect(state.getPublicSources().find((source) => source.id === "source-world-one")?.displayName).toBe("Renamed World");
    expect(state.getSourceRows("world-one")?.find((row) => row.playerId === "local-player:miner")?.sourceServer).toBe("Renamed World");
    expect(state.getMainRows().find((row) => row.playerId === "local-player:miner")?.sourceServer).toBe("Renamed World");

    state.updateSourcePlayer({
      actorRole: "owner",
      sourceId: "source-world-one",
      playerId: "local-player:miner",
      username: "Miner",
      sourceName: "World Two",
      blocksMined: 100,
      reason: "merge duplicate source",
    });

    const sources = state.listEditableSinglePlayerSources("local-player:miner", "").rows;
    expect(sources.filter((row) => row.sourceName === "World Two")).toHaveLength(1);
    expect(sources.find((row) => row.sourceName === "World Two")?.blocksMined).toBe(150);
    expect(sources.some((row) => row.sourceName === "Renamed World")).toBe(false);
  });
});
