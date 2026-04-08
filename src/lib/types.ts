export type SyncSource = "live" | "demo" | "empty" | "error";

export interface SyncMeta {
  source: SyncSource;
  title: string;
  description: string;
}

export interface PlayerSummary {
  id: string;
  username: string;
  minecraftUuid?: string | null;
  clientId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastModVersion?: string | null;
  lastMinecraftVersion?: string | null;
  lastServerName?: string | null;
  totalSyncedBlocks: number;
  totalSessions: number;
  totalPlaySeconds: number;
  trustLevel: string;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  progress: number;
  goal: number | null;
  percent: number;
  isActive: boolean;
  lastSyncedAt: string;
  status: "active" | "complete" | "idle";
}

export interface SessionSummary {
  id: string;
  sessionKey: string;
  worldId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  activeSeconds: number;
  totalBlocks: number;
  averageBph: number;
  peakBph: number;
  bestStreakSeconds: number;
  topBlock?: string | null;
  status: "active" | "paused" | "ended";
}

export interface DailyGoalSummary {
  goalDate: string;
  target: number;
  progress: number;
  completed: boolean;
  percent: number;
}

export interface WorldSummary {
  id: string;
  displayName: string;
  kind: "singleplayer" | "multiplayer" | "realm" | "unknown";
  host?: string | null;
  totalBlocks: number;
  totalSessions: number;
  totalPlaySeconds: number;
  lastSeenAt: string;
}

export interface NotificationSummary {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  createdAt: string;
}

export interface LeaderboardSummary {
  leaderboardType: string;
  score: number;
  rankCached?: number | null;
  updatedAt: string;
}

export interface LeaderboardRowSummary {
  playerId: string;
  username: string;
  lastSeenAt: string;
  aeternumBlocks: number;
  totalBlocks: number;
  totalSessions: number;
  rank: number;
}

export interface SettingsSummary {
  autoSyncMiningData: boolean;
  crossServerAggregation: boolean;
  realTimeHudSync: boolean;
  leaderboardOptIn: boolean;
  publicProfile: boolean;
  sessionSharing: boolean;
  hudEnabled: boolean;
  hudAlignment: string;
  hudScale: number;
}

export interface AeTweaksSnapshot {
  meta: SyncMeta;
  player: PlayerSummary | null;
  projects: ProjectSummary[];
  sessions: SessionSummary[];
  dailyGoal: DailyGoalSummary | null;
  worlds: WorldSummary[];
  notifications: NotificationSummary[];
  leaderboard: LeaderboardSummary | null;
  settings: SettingsSummary;
  estimatedBlocksPerHour: number;
  estimatedFinishSeconds: number | null;
}
