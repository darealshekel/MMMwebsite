export type SyncSource = "live" | "demo" | "empty" | "error" | "auth_required";

export interface SyncMeta {
  source: SyncSource;
  title: string;
  description: string;
}

export interface PlayerSummary {
  id: string;
  username: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastModVersion?: string | null;
  lastMinecraftVersion?: string | null;
  lastServerName?: string | null;
  totalSyncedBlocks: number;
  aeternumTotalDigs: number | null;
  totalSessions: number;
  totalPlaySeconds: number;
  trustLevel: string;
}

export interface ViewerSummary {
  userId: string;
  username: string;
  avatarUrl: string;
  provider: string;
  role?: "player" | "admin" | "owner" | string;
  isAdmin?: boolean;
  discordId?: string | null;
  discordUsername?: string | null;
  discordAvatar?: string | null;
  minecraftUuidHash?: string | null;
}

export type AppRole = "player" | "admin" | "owner";

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

export type LeaderboardViewKind = "global" | "source";
export type SourceApprovalStatus = "pending" | "approved" | "rejected";
export type SourceScope = "public_server" | "private_singleplayer" | "unsupported";

export interface SourceScanEvidenceSummary {
  scoreboardTitle: string | null;
  sampleSidebarLines: string[];
  detectedStatFields: string[];
  confidence: number;
  iconUrl: string | null;
  rawScanEvidence: Record<string, unknown> | null;
}

export interface LeaderboardRowSummary {
  playerId: string | null;
  username: string;
  skinFaceUrl: string;
  playerFlagUrl?: string | null;
  lastUpdated: string;
  blocksMined: number;
  totalDigs: number;
  rank: number;
  sourceServer: string;
  sourceKey: string;
  sourceCount: number;
  viewKind: LeaderboardViewKind;
  sourceId?: string | null;
  sourceSlug?: string | null;
  rowKey?: string;
}

export interface PublicSourceSummary {
  id: string;
  slug: string;
  displayName: string;
  sourceType: string;
  logoUrl?: string | null;
  totalBlocks?: number;
  isDead?: boolean;
  playerCount?: number;
  sourceScope?: string;
  hasSpreadsheetTotal?: boolean;
}

export type SubmitSubmissionType = "edit-existing-source" | "add-new-source";
export type SubmitSubmissionStatus = "pending" | "approved" | "rejected";

export interface SubmitEditableSourceSummary {
  sourceId: string;
  sourceSlug: string;
  sourceName: string;
  sourceType: string;
  sourceScope: string;
  logoUrl: string | null;
  currentBlocks: number;
  rank: number;
  lastUpdated: string;
}

export interface SubmitSubmissionSummary {
  id: string;
  userId: string;
  minecraftUuidHash: string;
  minecraftUsername: string;
  type: SubmitSubmissionType;
  targetSourceId: string | null;
  targetSourceSlug: string | null;
  sourceName: string;
  sourceType: string;
  oldBlocksMined: number | null;
  submittedBlocksMined: number;
  proofFileName: string;
  proofMimeType: string;
  proofSize: number;
  proofImageRef: string;
  logoUrl: string | null;
  playerRows?: Array<{
    username: string;
    blocksMined: number;
  }>;
  status: SubmitSubmissionStatus;
  createdAt: string;
}

export interface SubmitPageData {
  ok: true;
  player: {
    minecraftUuidHash: string;
    minecraftUsername: string;
  };
  existingSources: SubmitEditableSourceSummary[];
  submissions: SubmitSubmissionSummary[];
}

export interface LeaderboardResponse {
  scope: "main" | "source";
  title: string;
  description: string;
  scoreLabel: "Blocks Mined";
  source: PublicSourceSummary | null;
  featuredRows: LeaderboardRowSummary[];
  rows: LeaderboardRowSummary[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  totalBlocks: number;
  playerCount: number;
  highlightedPlayer: string | null;
  publicSources: PublicSourceSummary[];
}

export interface SpecialLeaderboardResponse {
  kind: string;
  title: string;
  description: string;
  scoreLabel: "Blocks Mined";
  featuredRows: LeaderboardRowSummary[];
  rows: LeaderboardRowSummary[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  totalBlocks: number;
  playerCount: number;
  highlightedPlayer: string | null;
  icons?: {
    ssp?: string | null;
    hsp?: string | null;
  } | null;
}

export interface PlayerServerStatSummary {
  sourceId?: string;
  playerId?: string;
  server: string;
  blocks: number;
  rank: number;
  joined: string;
}

export interface PlayerSessionSummary {
  date: string;
  server: string;
  duration: string;
  blocks: number;
}

export interface PlayerDetailResponse {
  rank: number;
  slug: string;
  name: string;
  blocksNum: number;
  avatarUrl: string;
  bio: string;
  joined: string;
  favoriteBlock: string;
  places: number;
  servers: PlayerServerStatSummary[];
  activity: number[];
  sessions: PlayerSessionSummary[];
}

export interface SourceApprovalSummary {
  id: string;
  displayName: string;
  worldKey: string;
  kind: "singleplayer" | "multiplayer" | "realm" | "unknown";
  sourceScope: SourceScope;
  totalBlocks: number;
  playerCount: number;
  submittedByUsername: string | null;
  submittedAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  approvalStatus: SourceApprovalStatus;
  eligibleForPublic: boolean;
  scanEvidence: SourceScanEvidenceSummary;
  moderationKind?: "world" | "submission";
  sourceType?: string;
  submittedByUserId?: string | null;
  proofImageRef?: string | null;
  proofFileName?: string | null;
  proofMimeType?: string | null;
  proofSize?: number | null;
  reviewNote?: string | null;
  playerRows?: Array<{
    username: string;
    blocksMined: number;
  }>;
}

export interface AdminRoleLookupTarget {
  uuid: string | null;
  username: string | null;
  userId: string | null;
  playerId: string | null;
  role: AppRole;
  minecraftUuidHash: string;
}

export interface AdminRoleLookupResponse {
  ok: true;
  target: AdminRoleLookupTarget;
}

export interface AdminFlagTarget {
  uuid: string | null;
  username: string | null;
  playerId: string | null;
  userId: string | null;
  minecraftUuidHash: string;
  flagCode: string | null;
  flagUrl: string | null;
}

export interface AdminFlagResponse {
  ok: true;
  target: AdminFlagTarget;
}

export interface EditableSourceSummary {
  id: string;
  slug: string;
  displayName: string;
  sourceType: string;
  isPublic: boolean;
  isApproved: boolean;
  logoUrl?: string | null;
  totalBlocks?: number;
  playerCount?: number;
  needsManualReview?: boolean;
  manualReviewReason?: string | null;
}

export interface EditableSourceRowSummary {
  playerId: string;
  username: string;
  minecraftUuidHash: string | null;
  blocksMined: number;
  lastUpdated: string;
  flagUrl: string | null;
}

export interface EditableSinglePlayerSummary {
  playerId: string;
  username: string;
  blocksMined: number;
  rank: number;
  sourceCount: number;
  lastUpdated: string;
  flagUrl: string | null;
}

export interface EditableSinglePlayerSourceSummary {
  sourceId: string;
  sourceSlug: string;
  sourceName: string;
  logoUrl: string | null;
  playerId: string;
  username: string;
  blocksMined: number;
  rank: number;
  lastUpdated: string;
  needsManualReview?: boolean;
}

export interface AdminAuditEntrySummary {
  id: string;
  actionType: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
  actorRole: string;
}

export type MinecraftClaimStatus = "pending" | "approved" | "rejected";

export interface MinecraftClaimSummary {
  id: string;
  userId: string;
  discord: {
    id: string | null;
    username: string | null;
    avatar: string | null;
  };
  minecraftUuid: string;
  minecraftName: string;
  submittedValue: string;
  status: MinecraftClaimStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  rejectionReason: string | null;
}

export interface SiteContentResponse {
  content: Record<string, string>;
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
  viewer: ViewerSummary | null;
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
  lastSyncedAt: string | null;
}
