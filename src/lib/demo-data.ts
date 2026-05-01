import type { MMMSnapshot, SettingsSummary } from "@/lib/types";

const defaultSettings: SettingsSummary = {
  autoSyncMiningData: true,
  crossServerAggregation: true,
  realTimeHudSync: false,
  leaderboardOptIn: true,
  publicProfile: true,
  sessionSharing: false,
  hudEnabled: true,
  hudAlignment: "top-right",
  hudScale: 1,
};

export const demoSnapshot: MMMSnapshot = {
  meta: {
    source: "demo",
    title: "Demo data active",
    description: "Add your Supabase URL and anon key to load real MMM mining data into the dashboard.",
  },
  viewer: null,
  player: {
    id: "demo-player",
    username: "MineGod42",
    firstSeenAt: "2026-03-21T09:15:00Z",
    lastSeenAt: "2026-04-08T14:22:00Z",
    lastModVersion: "1.0.4",
    lastMinecraftVersion: "1.21.4",
    lastServerName: "Aeternum",
    totalSyncedBlocks: 312500,
    aeternumTotalDigs: 312500,
    totalSessions: 234,
    totalPlaySeconds: 1123200,
    trustLevel: "anonymous",
  },
  projects: [
    { id: "p1", key: "diamond-mine-v2", name: "Diamond Mine v2", progress: 4820, goal: 7200, percent: 67, isActive: true, lastSyncedAt: "2026-04-08T14:22:00Z", status: "active" },
    { id: "p2", key: "nether-highway", name: "Nether Highway", progress: 12400, goal: 36000, percent: 34, isActive: false, lastSyncedAt: "2026-04-07T18:05:00Z", status: "active" },
    { id: "p3", key: "iron-farm-clear", name: "Iron Farm Clear", progress: 8190, goal: 9000, percent: 91, isActive: false, lastSyncedAt: "2026-04-06T19:50:00Z", status: "active" },
    { id: "p4", key: "base-excavation", name: "Base Excavation", progress: 15000, goal: 15000, percent: 100, isActive: false, lastSyncedAt: "2026-04-01T11:10:00Z", status: "complete" },
  ],
  sessions: [
    { id: "s1", sessionKey: "sess-1", worldId: "w1", startedAt: "2026-04-08T12:08:00Z", endedAt: "2026-04-08T14:22:00Z", activeSeconds: 8040, totalBlocks: 2340, averageBph: 1048, peakBph: 1640, bestStreakSeconds: 840, topBlock: "minecraft:stone", status: "ended" },
    { id: "s2", sessionKey: "sess-2", worldId: "w2", startedAt: "2026-04-07T18:28:00Z", endedAt: "2026-04-07T20:10:00Z", activeSeconds: 6120, totalBlocks: 1890, averageBph: 1112, peakBph: 1470, bestStreakSeconds: 650, topBlock: "minecraft:netherrack", status: "ended" },
    { id: "s3", sessionKey: "sess-3", worldId: "w1", startedAt: "2026-04-06T08:04:00Z", endedAt: "2026-04-06T11:05:00Z", activeSeconds: 10860, totalBlocks: 3410, averageBph: 1132, peakBph: 1710, bestStreakSeconds: 1040, topBlock: "minecraft:deepslate", status: "ended" },
    { id: "s4", sessionKey: "sess-4", worldId: "w3", startedAt: "2026-04-05T14:55:00Z", endedAt: "2026-04-05T17:33:00Z", activeSeconds: 9480, totalBlocks: 2780, averageBph: 1054, peakBph: 1320, bestStreakSeconds: 590, topBlock: "minecraft:obsidian", status: "ended" },
  ],
  dailyGoal: {
    goalDate: "2026-04-08",
    target: 2000,
    progress: 1560,
    completed: false,
    percent: 78,
  },
  worlds: [
    { id: "w1", displayName: "Aeternum", kind: "multiplayer", totalBlocks: 219400, totalSessions: 142, totalPlaySeconds: 654000, lastSeenAt: "2026-04-08T14:22:00Z" },
    { id: "w2", displayName: "Nether Highway Test", kind: "singleplayer", totalBlocks: 48320, totalSessions: 33, totalPlaySeconds: 181200, lastSeenAt: "2026-04-07T20:10:00Z" },
    { id: "w3", displayName: "Obsidian Vault", kind: "multiplayer", totalBlocks: 44780, totalSessions: 21, totalPlaySeconds: 113400, lastSeenAt: "2026-04-05T17:33:00Z" },
  ],
  notifications: [
    { id: "n1", kind: "goal", title: "Daily goal reached 78%", body: "440 blocks left to hit today's target.", createdAt: "2026-04-08T14:10:00Z" },
    { id: "n2", kind: "project", title: "Diamond Mine v2 updated", body: "Project progress moved to 67%.", createdAt: "2026-04-08T13:48:00Z" },
    { id: "n3", kind: "session", title: "Session synced", body: "Latest mining session uploaded successfully.", createdAt: "2026-04-08T12:24:00Z" },
  ],
  leaderboard: {
    leaderboardType: "global",
    score: 312500,
    rankCached: 2,
    updatedAt: "2026-04-08T14:22:00Z",
  },
  settings: defaultSettings,
  estimatedBlocksPerHour: 1247,
  estimatedFinishSeconds: 309600,
  lastSyncedAt: "2026-04-08T14:22:00Z",
};
