import { localLeaderboardSummary, localPlayerDetail } from "@/lib/local-static-data";
import type { AeTweaksSnapshot, ViewerSummary } from "@/lib/types";

export const LOCAL_OWNER_VIEWER: ViewerSummary = {
  userId: "local-owner",
  username: "5hekel",
  avatarUrl: "https://minotar.net/avatar/5hekel/64",
  provider: "local-dev",
  role: "owner",
  isAdmin: true,
  discordId: "local-dev-discord",
  discordUsername: "5hekel",
  discordAvatar: "https://minotar.net/avatar/5hekel/64",
  minecraftUuidHash: "local:5hekel",
};

export async function buildLocalOwnerSnapshot(): Promise<AeTweaksSnapshot> {
  const now = new Date().toISOString();
  const leaderboard = await localLeaderboardSummary({ pageSize: 10, query: "5hekel" });
  const ownerRow = leaderboard.rows.find((row) => row.username.toLowerCase() === "5hekel")
    ?? leaderboard.featuredRows.find((row) => row.username.toLowerCase() === "5hekel")
    ?? null;
  const playerDetail = await localPlayerDetail("5hekel");
  const totalBlocks = ownerRow?.blocksMined ?? playerDetail?.blocksNum ?? 0;
  const lastUpdated = ownerRow?.lastUpdated ?? now;

  return {
    meta: {
      source: "live",
      title: "Local Owner Dashboard",
      description: "Local build is connected as 5hekel.",
    },
    viewer: LOCAL_OWNER_VIEWER,
    player: {
      id: "local-owner-player",
      username: "5hekel",
      firstSeenAt: playerDetail?.joined ?? lastUpdated,
      lastSeenAt: lastUpdated,
      lastModVersion: null,
      lastMinecraftVersion: null,
      lastServerName: ownerRow?.sourceServer ?? playerDetail?.servers[0]?.server ?? null,
      totalSyncedBlocks: totalBlocks,
      aeternumTotalDigs: null,
      totalSessions: 0,
      totalPlaySeconds: 0,
      trustLevel: "owner",
    },
    projects: [],
    sessions: [],
    dailyGoal: null,
    worlds: (playerDetail?.servers ?? []).slice(0, 12).map((server, index) => ({
      id: server.sourceId ?? `local-world-${index + 1}`,
      displayName: server.server,
      kind: "unknown",
      totalBlocks: server.blocks,
      totalSessions: 0,
      totalPlaySeconds: 0,
      lastSeenAt: server.joined || lastUpdated,
    })),
    notifications: [
      {
        id: "local-owner-linked",
        kind: "local",
        title: "5hekel owner account linked",
        body: "This localhost build is using the local owner session.",
        createdAt: now,
      },
    ],
    leaderboard: totalBlocks > 0
      ? {
          leaderboardType: "single_players",
          score: totalBlocks,
          rankCached: ownerRow?.rank ?? playerDetail?.rank ?? null,
          updatedAt: lastUpdated,
        }
      : null,
    settings: {
      autoSyncMiningData: true,
      crossServerAggregation: true,
      realTimeHudSync: false,
      leaderboardOptIn: true,
      publicProfile: true,
      sessionSharing: false,
      hudEnabled: true,
      hudAlignment: "top-right",
      hudScale: 1,
    },
    estimatedBlocksPerHour: 0,
    estimatedFinishSeconds: null,
    lastSyncedAt: lastUpdated,
  };
}
