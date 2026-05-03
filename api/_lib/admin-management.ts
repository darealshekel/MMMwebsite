import {
  canTransitionRole,
  formatMinecraftUuid,
  isAllowedSiteContentKey,
  isManagementRole,
  isOwnerRole,
  normalizeAppRole,
  normalizeMinecraftUuid,
  normalizePlayerFlagCode,
  parseNonNegativeInteger,
  sanitizeEditableText,
  sanitizeRejectReason,
  sanitizeSiteContentValue,
  uuidLookupForms,
} from "../../shared/admin-management.js";
import { canonicalPlayerName, cleanPlayerDisplayName } from "../../shared/player-identity.js";
import { buildPlayerRenameIndexes, cleanPlayerRenameName, resolveRenamedPlayerName } from "../../shared/player-rename.js";
import { buildSourceSlug } from "../../shared/source-slug.js";
import type { AuthContext } from "./session.js";
import { hashDeterministicValue, supabaseAdmin } from "./server.js";
import { resolveExistingPlayerBeforeCreate } from "./player-resolver.js";
import {
  getStaticEditableSinglePlayers,
  getStaticEditableSinglePlayerSourceRows,
  getStaticEditableSourceRows,
  getStaticEditableSources,
  getStaticMainLeaderboardRows,
  getStaticPublicSources,
  getStaticSourceLeaderboardRows,
  getStaticSpecialLeaderboardRows,
  getStaticSpecialSources,
} from "./static-mmm-leaderboard.js";
import { loadApprovedLiveSources } from "./static-mmm-overrides.js";

type RoleInfo = {
  role: "player" | "admin" | "owner";
  isAdmin: boolean;
};

type ResolvedIdentity = {
  minecraftUuidHash: string | null;
  uuid: string | null;
  username: string | null;
  userId: string | null;
  playerId: string | null;
  role: "player" | "admin" | "owner";
};

type AuditPayload = {
  actorUserId: string;
  actorRole: string;
  actionType: string;
  targetType: string;
  targetId: string;
  targetUuidHash?: string | null;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  reason?: string | null;
};

type PublicSiteContent = Record<string, string>;
type EditableSourceRow = {
  id: string;
  slug: string;
  display_name: string;
  source_type: string;
  is_public: boolean;
  is_approved: boolean;
};
type ManualOverrideRow = {
  id: string;
  kind: "source" | "source-row" | "single-player";
  data: Record<string, unknown>;
};
type MmmSubmissionRow = {
  id: string;
  source_name: string;
  source_type: string;
  submitted_blocks_mined: number;
  logo_url: string | null;
  payload: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};
type AggregatedEditableSourceRow = {
  username: string;
  blocksMined: number;
  lastUpdated: string;
  rank: number;
  playerId: string;
};
type AggregatedEditableSource = {
  id: string;
  slug: string;
  displayName: string;
  sourceType: string;
  logoUrl: string | null;
  createdAt: string;
  totalBlocks: number;
  rows: AggregatedEditableSourceRow[];
  liveApprovedSource?: boolean;
  replacesStaticSourceId?: string | null;
};
type EffectiveSinglePlayerSourceRow = {
  sourceId: string;
  sourceSlug: string;
  sourceName: string;
  logoUrl: string | null;
  playerId: string;
  username: string;
  blocksMined: number;
  rank: number;
  lastUpdated: string;
  needsManualReview: boolean;
  liveApprovedSource?: boolean;
};
type EditableSinglePlayerOption = {
  playerId: string;
  username: string;
  blocksMined: number;
  rank: number;
  sourceCount: number;
  lastUpdated: string;
  flagUrl: string | null;
};
type AuditLogRow = {
  id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  created_at: string;
  actor_role: string;
};

export class AdminActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AdminActionError";
    this.status = status;
  }
}

function requireManagementAccess(auth: AuthContext) {
  if (!isManagementRole(auth.viewer.role) && auth.viewer.isAdmin !== true) {
    throw new AdminActionError("You do not have permission to manage admin tools.", 403);
  }
}

function requireOwnerAccess(auth: AuthContext) {
  if (!isOwnerRole(auth.viewer.role)) {
    throw new AdminActionError("Only an owner can manage roles.", 403);
  }
}

function parseProfilePreferences(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>) };
  }
  return {};
}

function roleFromPreferences(input: unknown): RoleInfo {
  const preferences = parseProfilePreferences(input);
  const role = normalizeAppRole(preferences.role) as RoleInfo["role"];
  return {
    role,
    isAdmin: isManagementRole(role) || preferences.isAdmin === true,
  };
}

export function buildFlagAssetUrl(flagCode: string | null | undefined) {
  const normalized = normalizePlayerFlagCode(flagCode);
  return normalized ? `/generated/world-flags/${normalized}.png` : null;
}

async function resolveUuidHashCandidates(rawUuid: string) {
  const forms = uuidLookupForms(rawUuid);
  if (forms.length === 0) {
    throw new AdminActionError("Minecraft UUID format is invalid.", 400);
  }

  const hashes = await Promise.all(forms.map((value) => hashDeterministicValue(value)));
  return [...new Set(hashes)];
}

async function resolveUserRole(userId: string | null) {
  if (!userId) {
    return { role: "player" as const, isAdmin: false };
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("profile_preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return roleFromPreferences(data?.profile_preferences);
}

export async function resolveIdentityByUuid(rawUuid: string): Promise<ResolvedIdentity> {
  const hashes = await resolveUuidHashCandidates(rawUuid);

  const accountLookup = await supabaseAdmin
    .from("connected_accounts")
    .select("user_id,minecraft_username,minecraft_uuid_hash")
    .in("minecraft_uuid_hash", hashes)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (accountLookup.error) throw accountLookup.error;

  const playerLookup = await supabaseAdmin
    .from("users")
    .select("id,username,minecraft_uuid_hash")
    .in("minecraft_uuid_hash", hashes)
    .order("last_seen_at", { ascending: false })
    .limit(5);

  const metadataLookup = await supabaseAdmin
    .from("player_metadata")
    .select("minecraft_uuid_hash,player_id")
    .in("minecraft_uuid_hash", hashes)
    .limit(5);

  const account = (accountLookup.data ?? [])[0] as
    | { user_id: string; minecraft_username: string; minecraft_uuid_hash: string }
    | undefined;
  const player = (playerLookup.error ? [] : playerLookup.data ?? [])[0] as
    | { id: string; username: string; minecraft_uuid_hash: string | null }
    | undefined;
  const metadata = (metadataLookup.error ? [] : metadataLookup.data ?? [])[0] as
    | { minecraft_uuid_hash: string; player_id: string | null }
    | undefined;

  const minecraftUuidHash =
    account?.minecraft_uuid_hash ?? player?.minecraft_uuid_hash ?? metadata?.minecraft_uuid_hash ?? null;
  const roleInfo = await resolveUserRole(account?.user_id ?? null);

  return {
    minecraftUuidHash,
    uuid: formatMinecraftUuid(rawUuid),
    username: account?.minecraft_username ?? player?.username ?? null,
    userId: account?.user_id ?? null,
    playerId: player?.id ?? metadata?.player_id ?? null,
    role: roleInfo.role,
  };
}

export async function insertAdminAuditLog(payload: AuditPayload) {
  const { error } = await supabaseAdmin.from("admin_audit_log").insert({
    actor_user_id: payload.actorUserId,
    actor_role: normalizeAppRole(payload.actorRole),
    action_type: payload.actionType,
    target_type: payload.targetType,
    target_id: payload.targetId,
    target_uuid_hash: payload.targetUuidHash ?? null,
    before_state: payload.beforeState ?? {},
    after_state: payload.afterState ?? {},
    reason: sanitizeEditableText(payload.reason ?? "", 240) || null,
  });

  if (error) throw error;
}
async function countOwners() {
  const { data, error } = await supabaseAdmin.from("users").select("id,profile_preferences");
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; profile_preferences?: unknown }>)
    .filter((row) => roleFromPreferences(row.profile_preferences).role === "owner")
    .length;
}

export async function lookupRoleByUuid(auth: AuthContext, rawUuid: string) {
  requireOwnerAccess(auth);
  const identity = await resolveIdentityByUuid(rawUuid);
  if (!identity.minecraftUuidHash) {
    throw new AdminActionError("No linked player was found for that UUID.", 404);
  }

  return {
    ok: true as const,
    target: {
      uuid: identity.uuid,
      username: identity.username,
      userId: identity.userId,
      playerId: identity.playerId,
      role: identity.role,
      minecraftUuidHash: identity.minecraftUuidHash,
    },
  };
}

export async function setRoleByUuid(auth: AuthContext, input: { uuid: string; role: string; reason?: string | null }) {
  requireOwnerAccess(auth);

  const identity = await resolveIdentityByUuid(input.uuid);
  if (!identity.userId || !identity.minecraftUuidHash) {
    throw new AdminActionError("That UUID is not linked to a website account yet.", 404);
  }

  const nextRole = normalizeAppRole(input.role) as RoleInfo["role"];
  const ownerCount = await countOwners();
  const transition = canTransitionRole({
    actorRole: auth.viewer.role,
    targetCurrentRole: identity.role,
    nextRole,
    ownerCount,
    isSelf: identity.userId === auth.userId,
  });
  if (!transition.ok) {
    throw new AdminActionError(transition.reason, 403);
  }

  const userLookup = await supabaseAdmin
    .from("users")
    .select("profile_preferences")
    .eq("id", identity.userId)
    .maybeSingle();
  if (userLookup.error) throw userLookup.error;

  const preferences = parseProfilePreferences(userLookup.data?.profile_preferences);
  const beforeRole = roleFromPreferences(preferences).role;
  const nextPreferences = {
    ...preferences,
    role: nextRole,
    isAdmin: nextRole === "admin" || nextRole === "owner",
  };

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      role: nextRole,
      profile_preferences: nextPreferences,
      updated_at: new Date().toISOString(),
    })
    .eq("id", identity.userId);
  if (updateError) throw updateError;

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "role.set",
    targetType: "user",
    targetId: identity.userId,
    targetUuidHash: identity.minecraftUuidHash,
    beforeState: { role: beforeRole },
    afterState: { role: nextRole },
    reason: input.reason ?? null,
  });

  return {
    ok: true as const,
    target: {
      uuid: identity.uuid,
      username: identity.username,
      userId: identity.userId,
      playerId: identity.playerId,
      role: nextRole,
      minecraftUuidHash: identity.minecraftUuidHash,
    },
  };
}

export async function lookupPlayerFlagByUuid(auth: AuthContext, rawUuid: string) {
  requireManagementAccess(auth);
  const identity = await resolveIdentityByUuid(rawUuid);
  if (!identity.minecraftUuidHash) {
    throw new AdminActionError("No player was found for that UUID.", 404);
  }

  const { data, error } = await supabaseAdmin
    .from("player_metadata")
    .select("flag_code")
    .eq("minecraft_uuid_hash", identity.minecraftUuidHash)
    .maybeSingle();
  if (error) throw error;

  const flagCode = normalizePlayerFlagCode(data?.flag_code ?? null);
  return {
    ok: true as const,
    target: {
      uuid: identity.uuid,
      username: identity.username,
      playerId: identity.playerId,
      userId: identity.userId,
      minecraftUuidHash: identity.minecraftUuidHash,
      flagCode,
      flagUrl: buildFlagAssetUrl(flagCode),
    },
  };
}

export async function setPlayerFlagByUuid(auth: AuthContext, input: { uuid: string; flagCode?: string | null; reason?: string | null }) {
  requireManagementAccess(auth);
  const identity = await resolveIdentityByUuid(input.uuid);
  if (!identity.minecraftUuidHash) {
    throw new AdminActionError("No player was found for that UUID.", 404);
  }

  const flagCode = input.flagCode == null || String(input.flagCode).trim() === ""
    ? null
    : normalizePlayerFlagCode(input.flagCode);
  if (input.flagCode != null && String(input.flagCode).trim() !== "" && !flagCode) {
    throw new AdminActionError("Flag code must be a 2-letter country code.", 400);
  }

  const previous = await lookupPlayerFlagByUuid(auth, input.uuid);

  const { error } = await supabaseAdmin
    .from("player_metadata")
    .upsert({
      minecraft_uuid_hash: identity.minecraftUuidHash,
      player_id: identity.playerId,
      flag_code: flagCode,
      updated_at: new Date().toISOString(),
    }, { onConflict: "minecraft_uuid_hash" });
  if (error) throw error;

  if (identity.username) {
    const staticPlayerId = `sheet:${identity.username.toLowerCase()}`;
    const existingOverride = (await loadManualOverrides("single-player")).get(staticPlayerId) ?? {};
    await upsertManualOverride(auth, "single-player", staticPlayerId, {
      ...existingOverride,
      flagUrl: buildFlagAssetUrl(flagCode),
    }, input.reason ?? null);
  }

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: flagCode ? "player.flag.set" : "player.flag.remove",
    targetType: "player",
    targetId: identity.playerId ?? identity.minecraftUuidHash,
    targetUuidHash: identity.minecraftUuidHash,
    beforeState: { flagCode: previous.target.flagCode },
    afterState: { flagCode },
    reason: input.reason ?? null,
  });

  return {
    ok: true as const,
    target: {
      uuid: identity.uuid,
      username: identity.username,
      playerId: identity.playerId,
      userId: identity.userId,
      minecraftUuidHash: identity.minecraftUuidHash,
      flagCode,
      flagUrl: buildFlagAssetUrl(flagCode),
    },
  };
}

export async function getPublicSiteContent(): Promise<PublicSiteContent> {
  const { data, error } = await supabaseAdmin
    .from("site_content_overrides")
    .select("key,value");
  if (error) throw error;

  const content: PublicSiteContent = {};
  for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
    if (!isAllowedSiteContentKey(row.key)) continue;
    const value = sanitizeSiteContentValue(row.value);
    if (!value) continue;
    content[row.key] = value;
  }
  return content;
}

export async function setSiteContentValue(auth: AuthContext, input: { key: string; value: string; reason?: string | null }) {
  requireManagementAccess(auth);
  if (!isAllowedSiteContentKey(input.key)) {
    throw new AdminActionError("Unsupported content key.", 400);
  }

  const value = sanitizeSiteContentValue(input.value);
  if (!value) {
    throw new AdminActionError("Content value cannot be empty.", 400);
  }

  const { data: previousRow, error: previousError } = await supabaseAdmin
    .from("site_content_overrides")
    .select("value")
    .eq("key", input.key)
    .maybeSingle();
  if (previousError) throw previousError;

  const { error } = await supabaseAdmin
    .from("site_content_overrides")
    .upsert({
      key: input.key,
      value,
      updated_by_user_id: auth.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
  if (error) throw error;

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "site-content.set",
    targetType: "site-content",
    targetId: input.key,
    beforeState: { value: previousRow?.value ?? null },
    afterState: { value },
    reason: input.reason ?? null,
  });

  return {
    ok: true as const,
    content: await getPublicSiteContent(),
  };
}

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSourceName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizePlayerName(value: unknown) {
  return canonicalPlayerName(value);
}

function cleanEditablePlayerName(value: unknown) {
  return cleanPlayerDisplayName(sanitizeEditableText(String(value ?? ""), 64)).slice(0, 32);
}

function isMissingSupabaseTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return record.code === "PGRST205" && String(record.message ?? "").includes("Could not find the table");
}

function effectiveStaticSourceTotal(
  sourceId: string,
  fallback: number,
  rowOverrides: Map<string, Record<string, unknown>>,
  playerOverrides = new Map<string, Record<string, unknown>>(),
) {
  const rows = getStaticEditableSourceRows(sourceId, "");
  let hasRowOverride = false;
  let rowTotal = 0;
  for (const row of rows) {
    const playerId = String(row.playerId ?? "");
    const username = String(row.username ?? "");
    if (isSinglePlayerHidden(playerOverrides, playerId, username)) {
      hasRowOverride = true;
      continue;
    }
    const override = rowOverrides.get(sourceRowOverrideKey(sourceId, playerId));
    if (override && Object.prototype.hasOwnProperty.call(override, "blocksMined")) {
      hasRowOverride = true;
    }
    if (isSourceRowHidden(override)) {
      hasRowOverride = true;
      continue;
    }
    rowTotal += toSafeNumber(override?.blocksMined, Number(row.blocksMined ?? 0));
  }
  const existingIds = new Set(rows.map((row) => String(row.playerId ?? "")));
  for (const [overrideKey, override] of rowOverrides.entries()) {
    const playerId = sourceRowPlayerIdFromOverrideKey(sourceId, overrideKey);
    if (!playerId || existingIds.has(playerId) || override.added !== true || isSourceRowHidden(override)) continue;
    if (isSinglePlayerHidden(playerOverrides, playerId, usernameFromManualSourceRowOverride(playerId, override))) continue;
    hasRowOverride = true;
    rowTotal += toSafeNumber(override.blocksMined, 0);
  }
  return hasRowOverride ? rowTotal : fallback;
}

function isSourceRowHidden(override: Record<string, unknown> | undefined) {
  return override?.hidden === true || Boolean(sanitizeEditableText(String(override?.mergedIntoSourceId ?? ""), 160));
}

function isSourceOverrideHidden(override: Record<string, unknown> | undefined) {
  return override?.hidden === true || override?.deleted === true;
}

function isSinglePlayerOverrideHidden(override: Record<string, unknown> | undefined) {
  return override?.hidden === true || override?.deleted === true;
}

function getSinglePlayerOverride(
  overrides: Map<string, Record<string, unknown>>,
  playerId: string,
  username?: string | null,
) {
  const normalizedUsername = normalizePlayerName(username ?? "");
  return overrides.get(playerId)
    ?? (normalizedUsername
      ? overrides.get(`sheet:${normalizedUsername}`) ?? overrides.get(localPlayerId(normalizedUsername))
      : undefined);
}

function isSinglePlayerHidden(
  overrides: Map<string, Record<string, unknown>>,
  playerId: string,
  username?: string | null,
) {
  return isSinglePlayerOverrideHidden(getSinglePlayerOverride(overrides, playerId, username));
}

function effectiveSinglePlayerSourceRows(
  playerId: string,
  overrides: Map<string, Record<string, unknown>>,
  sourceOverrides: Map<string, Record<string, unknown>>,
  submittedSources: AggregatedEditableSource[] = [],
  playerRenameIndexes = buildPlayerRenameIndexes(new Map<string, Record<string, unknown>>()),
): EffectiveSinglePlayerSourceRow[] {
  const normalizedPlayerId = playerId.trim().toLowerCase();
  const normalizedPlayerName = normalizedPlayerId.replace(/^sheet:/, "").replace(/^local-player:/, "");
  const submittedRows = submittedSources.flatMap((source) =>
    source.rows.flatMap((row) => {
      if (isSourceOverrideHidden(sourceOverrides.get(source.id))) return [];
      const rowPlayerId = row.playerId;
      const rowUsername = row.username;
      const effectiveUsername = resolveRenamedPlayerName(playerRenameIndexes, rowPlayerId, rowUsername) || rowUsername;
      const matchesPlayer = rowPlayerId.toLowerCase() === normalizedPlayerId
        || `sheet:${normalizePlayerName(rowUsername)}` === normalizedPlayerId
        || normalizePlayerName(rowUsername) === normalizePlayerName(normalizedPlayerName)
        || normalizePlayerName(effectiveUsername) === normalizePlayerName(normalizedPlayerName);
      if (!matchesPlayer) return [];
      const override = overrides.get(`${source.id}:${rowPlayerId}`);
      if (isSourceRowHidden(override)) return [];
      const sourceOverride = sourceOverrides.get(source.id);
      const sourceName = sanitizeEditableText(String(override?.sourceName ?? sourceOverride?.displayName ?? source.displayName ?? ""), 80);
      return [{
        sourceId: source.id,
        sourceSlug: source.slug,
        sourceName,
        logoUrl: typeof sourceOverride?.logoUrl === "string" ? sourceOverride.logoUrl : source.logoUrl ?? null,
        playerId: rowPlayerId,
        username: effectiveUsername,
        blocksMined: toSafeNumber(override?.blocksMined, row.blocksMined),
        rank: row.rank,
        lastUpdated: row.lastUpdated,
        needsManualReview: false,
        liveApprovedSource: source.liveApprovedSource === true,
      }];
    }),
  );
  const liveReplacementKeys = new Set(
    submittedRows
      .filter((row) => row.liveApprovedSource === true)
      .flatMap((row) => [
        `slug:${row.sourceSlug.trim().toLowerCase()}`,
        `name:${normalizeSourceName(row.sourceName)}`,
      ]),
  );
  const staticRows = getStaticEditableSinglePlayerSourceRows(playerId, "").flatMap((row) => {
    const sourceId = String(row.sourceId ?? "");
    const rowPlayerId = String(row.playerId ?? "");
    const override = overrides.get(`${sourceId}:${rowPlayerId}`);
    if (isSourceRowHidden(override)) return [];
    const sourceOverride = sourceOverrides.get(sourceId);
    if (isSourceOverrideHidden(sourceOverride)) return [];
    const sourceName = sanitizeEditableText(String(override?.sourceName ?? sourceOverride?.displayName ?? row.sourceName ?? ""), 80);
    const sourceSlug = String(row.sourceSlug ?? "").trim().toLowerCase();
    if (liveReplacementKeys.has(`slug:${sourceSlug}`) || liveReplacementKeys.has(`name:${normalizeSourceName(sourceName)}`)) {
      return [];
    }
    const originalUsername = String(row.username ?? "");
    const effectiveUsername = resolveRenamedPlayerName(playerRenameIndexes, rowPlayerId, originalUsername) || originalUsername;
    return [{
      sourceId,
      sourceSlug,
      sourceName,
      logoUrl: typeof sourceOverride?.logoUrl === "string" ? sourceOverride.logoUrl : row.logoUrl ? String(row.logoUrl) : null,
      playerId: rowPlayerId,
      username: effectiveUsername,
      blocksMined: toSafeNumber(override?.blocksMined, Number(row.blocksMined ?? 0)),
      rank: Number(row.rank ?? 0),
      lastUpdated: String(row.lastUpdated ?? ""),
      needsManualReview: Boolean(row.needsManualReview),
    }];
  });

  const knownRowKeys = new Set(
    [...staticRows, ...submittedRows].map((row) => `${row.sourceId}:${row.playerId}`),
  );
  const sourceLookup = new Map<string, {
    id: string;
    slug: string;
    displayName: string;
    logoUrl: string | null;
    sourceType?: string;
  }>();
  for (const source of getStaticEditableSources("")) {
    const sourceId = String(source.id ?? "");
    if (!sourceId) continue;
    const sourceOverride = sourceOverrides.get(sourceId);
    if (isSourceOverrideHidden(sourceOverride)) continue;
    sourceLookup.set(sourceId, {
      id: sourceId,
      slug: String(source.slug ?? ""),
      displayName: sanitizeEditableText(String(sourceOverride?.displayName ?? source.displayName ?? ""), 80),
      logoUrl: typeof sourceOverride?.logoUrl === "string" ? sourceOverride.logoUrl : source.logoUrl ?? null,
      sourceType: String(source.sourceType ?? "server"),
    });
  }
  for (const source of submittedSources) {
    const sourceOverride = sourceOverrides.get(source.id);
    if (isSourceOverrideHidden(sourceOverride)) continue;
    sourceLookup.set(source.id, {
      id: source.id,
      slug: source.slug,
      displayName: sanitizeEditableText(String(sourceOverride?.displayName ?? source.displayName ?? ""), 80),
      logoUrl: typeof sourceOverride?.logoUrl === "string" ? sourceOverride.logoUrl : source.logoUrl ?? null,
      sourceType: source.sourceType,
    });
  }
  const manualRows: EffectiveSinglePlayerSourceRow[] = [];
  for (const [overrideKey, override] of overrides.entries()) {
    if (override.added !== true || isSourceRowHidden(override)) continue;
    const sourceId = [...sourceLookup.keys()].find((candidate) => overrideKey.startsWith(`${candidate}:`));
    if (!sourceId) continue;
    const overridePlayerId = sourceRowPlayerIdFromOverrideKey(sourceId, overrideKey);
    const overrideUsername = usernameFromManualSourceRowOverride(overridePlayerId, override);
    const effectiveUsername = resolveRenamedPlayerName(playerRenameIndexes, overridePlayerId, overrideUsername) || overrideUsername;
    const matchesPlayer = overridePlayerId.toLowerCase() === normalizedPlayerId
      || normalizePlayerName(overrideUsername) === normalizePlayerName(normalizedPlayerName)
      || normalizePlayerName(effectiveUsername) === normalizePlayerName(normalizedPlayerName);
    if (!matchesPlayer || knownRowKeys.has(overrideKey)) continue;
    const source = sourceLookup.get(sourceId);
    if (!source) continue;
    manualRows.push({
      sourceId: source.id,
      sourceSlug: source.slug,
      sourceName: source.displayName,
      logoUrl: source.logoUrl,
      playerId: overridePlayerId,
      username: effectiveUsername,
      blocksMined: toSafeNumber(override.blocksMined, 0),
      rank: 0,
      lastUpdated: String(override.lastUpdated ?? ""),
      needsManualReview: false,
    });
  }

  return [...staticRows, ...submittedRows, ...manualRows];
}

async function assertUniqueSourceName(sourceId: string, displayName: string) {
  const normalized = normalizeSourceName(displayName);
  const sourceOverrides = await loadManualOverrides("source");
  const staticConflict = getStaticEditableSources("").find((source) => {
    const candidateId = String(source.id ?? "");
    if (candidateId === sourceId) return false;
    const override = sourceOverrides.get(candidateId);
    if (isSourceOverrideHidden(override)) return false;
    const candidateName = sanitizeEditableText(String(override?.displayName ?? source.displayName ?? ""), 80);
    return normalizeSourceName(candidateName) === normalized;
  });

  if (staticConflict) {
    throw new AdminActionError(`A source named "${displayName}" already exists. Choose a unique name before saving.`, 409);
  }

  const { data, error } = await supabaseAdmin
    .from("sources")
    .select("id,display_name")
    .ilike("display_name", displayName);
  if (error) {
    if (isMissingSupabaseTableError(error)) return;
    throw error;
  }

  const dbConflict = ((data ?? []) as Array<{ id: string; display_name: string | null }>).find((source) =>
    source.id !== sourceId && normalizeSourceName(source.display_name ?? "") === normalized,
  );
  if (dbConflict) {
    throw new AdminActionError(`A source named "${displayName}" already exists. Choose a unique name before saving.`, 409);
  }
}

async function loadManualOverrides(kind: ManualOverrideRow["kind"]) {
  const { data, error } = await supabaseAdmin
    .from("mmm_manual_overrides")
    .select("id,kind,data")
    .eq("kind", kind);

  if (error) {
    return new Map<string, Record<string, unknown>>();
  }

  return new Map(
    ((data ?? []) as ManualOverrideRow[])
      .map((row) => [row.id, row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {}]),
  );
}

export async function loadPlayerRenameIndex() {
  return buildPlayerRenameIndexes(await loadManualOverrides("single-player"));
}

async function loadApprovedMmmSubmissions() {
  const { data, error } = await supabaseAdmin
    .from("mmm_submissions")
    .select("id,source_name,source_type,submitted_blocks_mined,logo_url,payload,status,created_at")
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(250);
  if (error) {
    if (isMissingSupabaseTableError(error)) return [];
    return [];
  }
  return (data ?? []) as MmmSubmissionRow[];
}

async function loadMmmSubmissionsForPlayerOptions() {
  const { data, error } = await supabaseAdmin
    .from("mmm_submissions")
    .select("id,source_name,source_type,submitted_blocks_mined,logo_url,payload,status,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingSupabaseTableError(error)) return [];
    return [];
  }
  return (data ?? []) as MmmSubmissionRow[];
}

function submissionRows(row: MmmSubmissionRow) {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  const rawRows = Array.isArray(payload.playerRows) ? payload.playerRows : [];
  return rawRows.flatMap((entry): Array<{ username: string; blocksMined: number }> => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const username = cleanEditablePlayerName(record.username);
    const blocksMined = Number(record.blocksMined ?? 0);
    return username && Number.isFinite(blocksMined) && blocksMined > 0 ? [{ username, blocksMined: Math.floor(blocksMined) }] : [];
  });
}

function isServerSubmissionType(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  return normalized === "private-server" || normalized === "server";
}

function localPlayerId(username: string) {
  const key = normalizePlayerName(username);
  return key === "5hekel" ? "local-owner-player" : `local-player:${key}`;
}

function sourceRowOverrideKey(sourceId: string, playerId: string) {
  return `${sourceId}:${playerId}`;
}

function sourceRowPlayerIdFromOverrideKey(sourceId: string, overrideKey: string) {
  const prefix = `${sourceId}:`;
  return overrideKey.startsWith(prefix) ? overrideKey.slice(prefix.length) : "";
}

function usernameFromManualSourceRowOverride(playerId: string, override: Record<string, unknown>) {
  const explicitUsername = cleanEditablePlayerName(override.username);
  if (explicitUsername) return explicitUsername;
  return cleanEditablePlayerName(playerId.replace(/^local-player:/, "").replace(/^sheet:/, ""));
}

function getManualAddedSourceRows(
  source: {
    id: string;
    slug: string;
    displayName: string;
    logoUrl: string | null;
    sourceType?: string;
  },
  rowOverrides: Map<string, Record<string, unknown>>,
  search = "",
  playerRenameIndexes = buildPlayerRenameIndexes(new Map<string, Record<string, unknown>>()),
  playerOverrides = new Map<string, Record<string, unknown>>(),
): EffectiveSinglePlayerSourceRow[] {
  const rows: EffectiveSinglePlayerSourceRow[] = [];
  const prefix = `${source.id}:`;
  for (const [overrideKey, override] of rowOverrides.entries()) {
    if (!overrideKey.startsWith(prefix) || override.added !== true || isSourceRowHidden(override)) continue;
    const playerId = sourceRowPlayerIdFromOverrideKey(source.id, overrideKey);
    const originalUsername = usernameFromManualSourceRowOverride(playerId, override);
    const username = resolveRenamedPlayerName(playerRenameIndexes, playerId, originalUsername) || originalUsername;
    if (isSinglePlayerHidden(playerOverrides, playerId, username)) continue;
    if (!playerId || !username || (search && !username.toLowerCase().includes(search))) continue;
    rows.push({
      sourceId: source.id,
      sourceSlug: source.slug,
      sourceName: source.displayName,
      logoUrl: source.logoUrl,
      playerId,
      username,
      blocksMined: toSafeNumber(override.blocksMined, 0),
      rank: 0,
      lastUpdated: String(override.lastUpdated ?? ""),
      needsManualReview: false,
      liveApprovedSource: source.sourceType === "live",
    });
  }
  return rows;
}

function findStaticEditableSourceById(sourceId: string) {
  const normalizedId = sourceId.trim();
  if (!normalizedId) return null;
  return getStaticEditableSources(normalizedId).find((source) => String(source.id ?? "") === normalizedId) ?? null;
}

function findStaticEditableSourceBySlug(sourceSlug: string) {
  const normalizedSlug = sourceSlug.trim().toLowerCase();
  if (!normalizedSlug) return null;
  return getStaticEditableSources(normalizedSlug).find((source) =>
    String(source.slug ?? "").trim().toLowerCase() === normalizedSlug,
  ) ?? null;
}

function findManualSourceRowFallback(
  sourceId: string,
  rowOverrides: Map<string, Record<string, unknown>>,
) {
  for (const [overrideKey, override] of rowOverrides.entries()) {
    if (!overrideKey.startsWith(`${sourceId}:`)) continue;
    return {
      overrideKey,
      override,
      playerId: sourceRowPlayerIdFromOverrideKey(sourceId, overrideKey),
    };
  }
  return null;
}

async function resolveEditablePlayerBeforeCreate(
  auth: AuthContext,
  input: {
    playerId?: string | null;
    username?: string | null;
    createIfMissing?: boolean;
  },
) {
  const selectedId = sanitizeEditableText(input.playerId ?? "", 160);
  const cleanUsername = cleanEditablePlayerName(input.username);
  const existingPlayers = (await listEditableSinglePlayers(auth, "", 10_000)).players;
  if (selectedId) {
    const byId = existingPlayers.find((player) => player.playerId === selectedId);
    if (byId) {
      return {
        playerId: byId.playerId,
        username: byId.username,
        created: false,
      };
    }
  }

  const canonicalName = normalizePlayerName(cleanUsername);
  const byName = canonicalName
    ? existingPlayers.find((player) => normalizePlayerName(player.username) === canonicalName)
    : null;
  if (byName) {
    return {
      playerId: byName.playerId,
      username: byName.username,
      created: false,
    };
  }

  if (!input.createIfMissing) {
    throw new AdminActionError("Select an existing player or choose New Player before saving.", 400);
  }
  if (!cleanUsername) {
    throw new AdminActionError("Player name cannot be empty.", 400);
  }

  return {
    playerId: localPlayerId(cleanUsername),
    username: cleanUsername,
    created: true,
  };
}

function submittedSourceSlug(row: MmmSubmissionRow) {
  const displayName = sanitizeEditableText(row.source_name, 80) || row.id;
  return isServerSubmissionType(row.source_type)
    ? buildSourceSlug({ displayName })
    : buildSourceSlug({ displayName, worldKey: row.id });
}

function aggregateSubmittedSources(submissions: MmmSubmissionRow[]): AggregatedEditableSource[] {
  const buckets = new Map<string, {
    sourceName: string;
    sourceType: string;
    logoUrl: string | null;
    createdAt: string;
    rows: Map<string, { username: string; blocksMined: number; lastUpdated: string }>;
  }>();

  for (const submission of submissions) {
    const sourceName = sanitizeEditableText(submission.source_name, 80);
    if (!sourceName) continue;
    const rows = submissionRows(submission);
    if (!rows.length) continue;

    const slug = submittedSourceSlug(submission);
    const bucket = buckets.get(slug) ?? {
      sourceName,
      sourceType: submission.source_type || "server",
      logoUrl: submission.logo_url ?? null,
      createdAt: submission.created_at,
      rows: new Map<string, { username: string; blocksMined: number; lastUpdated: string }>(),
    };

    bucket.logoUrl = bucket.logoUrl ?? submission.logo_url ?? null;
    if (submission.created_at > bucket.createdAt) {
      bucket.createdAt = submission.created_at;
    }

    for (const row of rows) {
      const key = normalizePlayerName(row.username);
      const existing = bucket.rows.get(key);
      if (!existing || row.blocksMined > existing.blocksMined || submission.created_at > existing.lastUpdated) {
        bucket.rows.set(key, {
          username: existing?.username || row.username,
          blocksMined: Math.max(row.blocksMined, existing?.blocksMined ?? 0),
          lastUpdated: submission.created_at,
        });
      }
    }

    buckets.set(slug, bucket);
  }

  return [...buckets.entries()].map(([slug, bucket]) => {
    const rows = [...bucket.rows.values()]
      .sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username))
      .map((row, index) => ({
        ...row,
        rank: index + 1,
        playerId: localPlayerId(row.username),
      }));
    return {
      id: `submission:${slug}`,
      slug,
      displayName: bucket.sourceName,
      sourceType: bucket.sourceType,
      logoUrl: bucket.logoUrl,
      createdAt: bucket.createdAt,
      totalBlocks: rows.reduce((sum, row) => sum + row.blocksMined, 0),
      rows,
    };
  });
}

function liveSourceToEditableSource(source: Record<string, unknown>): AggregatedEditableSource | null {
  const id = sanitizeEditableText(String(source.id ?? ""), 160);
  const displayName = sanitizeEditableText(String(source.displayName ?? source.display_name ?? ""), 80);
  const slug = sanitizeEditableText(String(source.slug ?? buildSourceSlug({ displayName, worldKey: id })), 120);
  if (!id || !displayName || !slug) return null;

  const rows = (Array.isArray(source.rows) ? source.rows : [])
    .flatMap((entry): AggregatedEditableSourceRow[] => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const record = entry as Record<string, unknown>;
      const username = cleanEditablePlayerName(record.username);
      const playerId = sanitizeEditableText(String(record.playerId ?? localPlayerId(username)), 160);
      const blocksMined = toSafeNumber(record.blocksMined, 0);
      if (!username || !playerId || blocksMined <= 0) return [];
      return [{
        username,
        playerId,
        blocksMined,
        rank: Math.max(0, Math.floor(toSafeNumber(record.rank, 0))),
        lastUpdated: String(record.lastUpdated ?? source.createdAt ?? ""),
      }];
    })
    .reduce((merged, row) => {
      const key = normalizePlayerName(row.username);
      const existing = merged.get(key);
      if (!existing || row.blocksMined > existing.blocksMined) {
        merged.set(key, existing ? { ...row, username: existing.username } : row);
      }
      return merged;
    }, new Map<string, AggregatedEditableSourceRow>())
    .values();

  const dedupedRows = [...rows]
    .sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  if (!dedupedRows.length) return null;

  return {
    id,
    slug,
    displayName,
    sourceType: sanitizeEditableText(String(source.sourceType ?? "server"), 40) || "server",
    logoUrl: typeof source.logoUrl === "string" ? source.logoUrl : null,
    createdAt: String(source.createdAt ?? dedupedRows[0]?.lastUpdated ?? ""),
    totalBlocks: dedupedRows.reduce((sum, row) => sum + row.blocksMined, 0),
    rows: dedupedRows,
    liveApprovedSource: source.liveApprovedSource === true,
    replacesStaticSourceId: typeof source.replacesStaticSourceId === "string" ? source.replacesStaticSourceId : null,
  };
}

function mergeApprovedEditableSources(sources: AggregatedEditableSource[]) {
  const bySlug = new Map<string, AggregatedEditableSource>();
  const withoutSlug: AggregatedEditableSource[] = [];

  for (const source of sources) {
    const slug = source.slug.trim().toLowerCase();
    if (!slug) {
      withoutSlug.push(source);
      continue;
    }
    const existing = bySlug.get(slug);
    if (!existing || source.liveApprovedSource === true) {
      bySlug.set(slug, source);
    }
  }

  return [...bySlug.values(), ...withoutSlug];
}

async function loadApprovedEditableSources() {
  const [approvedSubmissions, liveSources] = await Promise.all([
    loadApprovedMmmSubmissions(),
    loadApprovedLiveSources(),
  ]);

  return mergeApprovedEditableSources([
    ...aggregateSubmittedSources(approvedSubmissions),
    ...liveSources.flatMap((source) => {
      const editable = liveSourceToEditableSource(source);
      return editable ? [editable] : [];
    }),
  ]);
}

async function upsertManualOverride(
  auth: AuthContext,
  kind: ManualOverrideRow["kind"],
  id: string,
  data: Record<string, unknown>,
  reason?: string | null,
) {
  const { error } = await supabaseAdmin
    .from("mmm_manual_overrides")
    .upsert({
      id,
      kind,
      data,
      reason: sanitizeEditableText(reason ?? "", 240) || null,
      updated_by_user_id: auth.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (error) {
    throw new AdminActionError("Manual editor storage is not installed yet.", 500);
  }
}

async function clearSinglePlayerBlockOverride(auth: AuthContext, playerId: string, username?: string | null, reason?: string | null) {
  const singlePlayerOverrides = await loadManualOverrides("single-player");
  const candidateIds = [
    playerId,
    username ? `sheet:${username.trim().toLowerCase()}` : "",
  ].filter(Boolean);

  for (const candidateId of [...new Set(candidateIds)]) {
    const existing = singlePlayerOverrides.get(candidateId);
    if (!existing || !Object.prototype.hasOwnProperty.call(existing, "blocksMined")) continue;
    const next = { ...existing };
    delete next.blocksMined;
    await upsertManualOverride(auth, "single-player", candidateId, next, reason ?? null);
  }
}

export async function searchEditableSources(auth: AuthContext, query: string, limit = 80) {
  requireManagementAccess(auth);
  const search = sanitizeEditableText(query, 80);
  const overrides = await loadManualOverrides("source");
  const rowOverrides = await loadManualOverrides("source-row");
  const playerOverrides = await loadManualOverrides("single-player");
  const playerRenameIndexes = buildPlayerRenameIndexes(playerOverrides);
  const approvedEditableSources = await loadApprovedEditableSources();
  const approvedSourcesBySlug = new Map(
    approvedEditableSources
      .filter((source) => source.liveApprovedSource === true)
      .map((source) => [source.slug.trim().toLowerCase(), source]),
  );
  const staticSourceSlugs = new Set<string>();
  const staticSources = getStaticEditableSources(search).flatMap((source) => {
    const sourceId = String(source.id ?? "");
    const override = overrides.get(sourceId);
    if (isSourceOverrideHidden(override)) return [];
    const staticSlug = String(source.slug ?? "").trim().toLowerCase();
    staticSourceSlugs.add(staticSlug);
    const liveReplacement = approvedSourcesBySlug.get(staticSlug);
    if (liveReplacement) {
      if (isSourceOverrideHidden(overrides.get(liveReplacement.id))) return [];
      const liveRows = liveReplacement.rows.filter((row) => !isSinglePlayerHidden(playerOverrides, row.playerId, row.username));
      return [{
        id: liveReplacement.id,
        slug: liveReplacement.slug,
        displayName: liveReplacement.displayName,
        sourceType: liveReplacement.sourceType || String(source.sourceType ?? "server"),
        isPublic: true,
        isApproved: true,
        logoUrl: liveReplacement.logoUrl ?? source.logoUrl ?? null,
        totalBlocks: liveRows.reduce((sum, row) => sum + row.blocksMined, 0),
        playerCount: liveRows.length,
      }];
    }
    const sourceTotal = effectiveStaticSourceTotal(
      sourceId,
      toSafeNumber(override?.totalBlocks, Number(source.totalBlocks ?? 0)),
      rowOverrides,
      playerOverrides,
    );
    const addedPlayerIds = new Set<string>();
    const visibleStaticPlayerIds = new Set<string>();
    for (const row of getStaticEditableSourceRows(sourceId, "")) {
      const playerId = String(row.playerId ?? "");
      const username = String(row.username ?? "");
      const rowOverride = rowOverrides.get(sourceRowOverrideKey(sourceId, playerId));
      if (playerId && !isSourceRowHidden(rowOverride) && !isSinglePlayerHidden(playerOverrides, playerId, username)) {
        visibleStaticPlayerIds.add(playerId);
      }
    }
    for (const [overrideKey, sourceRowOverride] of rowOverrides.entries()) {
      const addedPlayerId = sourceRowPlayerIdFromOverrideKey(sourceId, overrideKey);
      if (
        addedPlayerId
        && sourceRowOverride.added === true
        && !isSourceRowHidden(sourceRowOverride)
        && !isSinglePlayerHidden(playerOverrides, addedPlayerId, usernameFromManualSourceRowOverride(addedPlayerId, sourceRowOverride))
      ) {
        addedPlayerIds.add(addedPlayerId);
      }
    }
    return [{
      id: sourceId,
      slug: String(source.slug ?? ""),
      displayName: sanitizeEditableText(String(override?.displayName ?? source.displayName ?? ""), 80),
      sourceType: String(source.sourceType ?? "server"),
      isPublic: true,
      isApproved: true,
      logoUrl: typeof override?.logoUrl === "string" ? override.logoUrl : source.logoUrl ?? null,
      totalBlocks: sourceTotal,
      playerCount: visibleStaticPlayerIds.size + addedPlayerIds.size,
    }];
  });

  const submittedSources = approvedEditableSources.flatMap((submission) => {
    const displayName = sanitizeEditableText(submission.displayName, 80);
    if (!displayName) return [];
    if (staticSourceSlugs.has(submission.slug.trim().toLowerCase())) return [];
    if (search && !displayName.toLowerCase().includes(search.toLowerCase())) return [];
    const sourceOverride = overrides.get(submission.id);
    if (isSourceOverrideHidden(sourceOverride)) return [];
    const manualRows = getManualAddedSourceRows({
      id: submission.id,
      slug: submission.slug,
      displayName: sanitizeEditableText(String(sourceOverride?.displayName ?? displayName), 80),
      logoUrl: typeof sourceOverride?.logoUrl === "string" ? sourceOverride.logoUrl : submission.logoUrl ?? null,
      sourceType: submission.sourceType,
    }, rowOverrides, "", playerRenameIndexes, playerOverrides);
    const submissionRows = submission.rows.filter((row) => !isSinglePlayerHidden(playerOverrides, row.playerId, row.username));
    const mergedPlayerIds = new Set([...submissionRows.map((row) => row.playerId), ...manualRows.map((row) => row.playerId)]);
    return [{
      id: submission.id,
      slug: submission.slug,
      displayName,
      sourceType: submission.sourceType || "server",
      isPublic: true,
      isApproved: true,
      totalBlocks: submissionRows.reduce((sum, row) => sum + row.blocksMined, 0) + manualRows.reduce((sum, row) => sum + row.blocksMined, 0),
      logoUrl: submission.logoUrl ?? null,
      playerCount: mergedPlayerIds.size,
    }];
  });

  return {
    ok: true as const,
    sources: [...staticSources, ...submittedSources].slice(0, limit),
  };
}

export async function listEditableSourceRows(auth: AuthContext, sourceId: string, query: string, limit = 120) {
  requireManagementAccess(auth);
  const search = sanitizeEditableText(query, 80).toLowerCase();
  const overrides = await loadManualOverrides("source-row");
  const sourceOverrides = await loadManualOverrides("source");
  if (isSourceOverrideHidden(sourceOverrides.get(sourceId))) {
    return { ok: true as const, rows: [] };
  }
  const playerOverrides = await loadManualOverrides("single-player");
  const playerRenameIndexes = buildPlayerRenameIndexes(playerOverrides);
  if (sourceId.startsWith("submission:")) {
    const submission = aggregateSubmittedSources(await loadApprovedMmmSubmissions()).find((row) => row.id === sourceId);
    if (!submission) return { ok: true as const, rows: [] };
    const rows = [
      ...submission.rows.flatMap((row) => {
        const override = overrides.get(sourceRowOverrideKey(sourceId, row.playerId));
        if (isSourceRowHidden(override)) return [];
        const username = resolveRenamedPlayerName(playerRenameIndexes, row.playerId, row.username) || row.username;
        if (isSinglePlayerHidden(playerOverrides, row.playerId, username)) return [];
        return [{
          ...row,
          username,
          blocksMined: toSafeNumber(override?.blocksMined, row.blocksMined),
          lastUpdated: String(override?.lastUpdated ?? row.lastUpdated),
        }];
      }),
      ...getManualAddedSourceRows({
        id: submission.id,
        slug: submission.slug,
        displayName: submission.displayName,
        logoUrl: submission.logoUrl,
        sourceType: submission.sourceType,
      }, overrides, search, playerRenameIndexes, playerOverrides),
    ]
      .filter((row) => !search || row.username.toLowerCase().includes(search))
      .sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username))
      .slice(0, limit)
      .map((row, index) => ({
        playerId: row.playerId,
        username: row.username,
        minecraftUuidHash: null,
        blocksMined: row.blocksMined,
        lastUpdated: row.lastUpdated,
        flagUrl: null,
        rank: index + 1,
      }));
    return { ok: true as const, rows };
  }
  const staticRows = getStaticEditableSourceRows(sourceId, "").map((row) => {
    const key = sourceRowOverrideKey(sourceId, String(row.playerId ?? ""));
    const override = overrides.get(key);
    const originalUsername = String(row.username ?? "");
    const username = resolveRenamedPlayerName(playerRenameIndexes, String(row.playerId ?? ""), originalUsername) || originalUsername;
    const usernameKey = originalUsername.toLowerCase();
    const playerOverride = usernameKey ? playerOverrides.get(`sheet:${usernameKey}`) ?? playerOverrides.get(String(row.playerId ?? "")) : undefined;
    const hasFlagOverride = playerOverride && Object.prototype.hasOwnProperty.call(playerOverride, "flagUrl");
    return {
      playerId: String(row.playerId ?? ""),
      username,
      minecraftUuidHash: null,
      blocksMined: toSafeNumber(override?.blocksMined, Number(row.blocksMined ?? 0)),
      lastUpdated: String(row.lastUpdated ?? ""),
      flagUrl: hasFlagOverride
        ? (typeof playerOverride?.flagUrl === "string" ? playerOverride.flagUrl : null)
        : typeof override?.flagUrl === "string" ? override.flagUrl : row.playerFlagUrl ? String(row.playerFlagUrl) : null,
    };
  }).filter((row) =>
    !isSourceRowHidden(overrides.get(sourceRowOverrideKey(sourceId, row.playerId)))
    && !isSinglePlayerHidden(playerOverrides, row.playerId, row.username)
    && (!search || row.username.toLowerCase().includes(search)));

  const existingPlayerIds = new Set(staticRows.map((row) => row.playerId));
  const currentStaticSource = getStaticEditableSources("").find((source) => String(source.id ?? "") === sourceId);
  const approvedSource = (await loadApprovedEditableSources()).find((source) => source.id === sourceId);
  const sourceOverride = sourceOverrides.get(sourceId);
  const manualAddedRows = (currentStaticSource || approvedSource)
    ? getManualAddedSourceRows({
        id: sourceId,
        slug: String(currentStaticSource?.slug ?? approvedSource?.slug ?? ""),
        displayName: sanitizeEditableText(String(sourceOverride?.displayName ?? currentStaticSource?.displayName ?? approvedSource?.displayName ?? ""), 80),
        logoUrl: typeof sourceOverride?.logoUrl === "string" ? sourceOverride.logoUrl : currentStaticSource?.logoUrl ?? approvedSource?.logoUrl ?? null,
        sourceType: String(currentStaticSource?.sourceType ?? approvedSource?.sourceType ?? "server"),
      }, overrides, search, playerRenameIndexes, playerOverrides)
        .filter((row) => !existingPlayerIds.has(row.playerId))
        .map((row) => ({
          playerId: row.playerId,
          username: row.username,
          minecraftUuidHash: null,
          blocksMined: row.blocksMined,
          lastUpdated: row.lastUpdated,
          flagUrl: null,
        }))
    : [];

  const effectiveStaticRows = [...staticRows, ...manualAddedRows]
    .sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username));

  if (effectiveStaticRows.length > 0 || sourceId.includes(":")) {
    return {
      ok: true as const,
      rows: effectiveStaticRows.slice(0, limit),
    };
  }

  const { data, error } = await supabaseAdmin
    .from("leaderboard_entries")
    .select("player_id,score,updated_at,source_id")
    .eq("source_id", sourceId)
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const playerIds = [...new Set(((data ?? []) as Array<{ player_id: string | null }>).map((row) => row.player_id).filter(Boolean))];
  const playerLookup = playerIds.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("users").select("id,username,minecraft_uuid_hash").in("id", playerIds);
  if (playerLookup.error) throw playerLookup.error;

  const playersById = new Map(((playerLookup.data ?? []) as Array<{ id: string; username: string; minecraft_uuid_hash?: string | null }>)
    .map((row) => [row.id, row]));

  return {
    ok: true as const,
    rows: ((data ?? []) as Array<{ player_id: string | null; score: number | null; updated_at: string }>)
      .flatMap((row) => {
        if (!row.player_id) return [];
        const player = playersById.get(row.player_id);
        if (!player) return [];
        const username = resolveRenamedPlayerName(playerRenameIndexes, player.id, player.username) || player.username;
        if (isSinglePlayerHidden(playerOverrides, player.id, username)) return [];
        if (search && !username.toLowerCase().includes(search)) return [];
        return [{
          playerId: player.id,
          username,
          minecraftUuidHash: player.minecraft_uuid_hash ?? null,
          blocksMined: Number(row.score ?? 0),
          lastUpdated: row.updated_at,
          flagUrl: buildFlagAssetUrl(null),
        }];
      }),
  };
}

function latestStringTimestamp(left: string, right: string) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  if (!Number.isFinite(leftTime)) return right || left;
  if (!Number.isFinite(rightTime)) return left || right;
  return rightTime > leftTime ? right : left;
}

function staticSourceRowPlayerId(row: Record<string, unknown>, username: string) {
  return sanitizeEditableText(String(row.playerId ?? ""), 160) || localPlayerId(username);
}

function upsertExistingPlayerOption(
  playersById: Map<string, EditableSinglePlayerOption>,
  playerIdByCanonicalName: Map<string, string>,
  player: EditableSinglePlayerOption,
  options: { preferIncomingStats?: boolean } = {},
) {
  const username = cleanEditablePlayerName(player.username);
  const key = normalizePlayerName(username);
  const playerId = sanitizeEditableText(player.playerId, 160);
  if (!key || !playerId) return;

  const normalizedPlayer = {
    ...player,
    playerId,
    username,
    blocksMined: Math.max(0, Math.floor(toSafeNumber(player.blocksMined, 0))),
    sourceCount: Math.max(0, Math.floor(toSafeNumber(player.sourceCount, 0))),
  };
  const existingId = playerIdByCanonicalName.get(key);
  if (existingId) {
    const existing = playersById.get(existingId);
    if (!existing) return;
    playersById.set(existingId, {
      ...existing,
      blocksMined: options.preferIncomingStats
        ? normalizedPlayer.blocksMined
        : Math.max(existing.blocksMined, normalizedPlayer.blocksMined),
      sourceCount: options.preferIncomingStats
        ? normalizedPlayer.sourceCount
        : Math.max(existing.sourceCount, normalizedPlayer.sourceCount),
      lastUpdated: latestStringTimestamp(existing.lastUpdated, normalizedPlayer.lastUpdated),
      flagUrl: existing.flagUrl ?? normalizedPlayer.flagUrl,
    });
    return;
  }

  playerIdByCanonicalName.set(key, playerId);
  playersById.set(playerId, normalizedPlayer);
}

async function getAllExistingPlayersForOwnerTools(): Promise<EditableSinglePlayerOption[]> {
  const [overrides, sourceRowOverrides, sourceOverrides, approvedSources, moderationSubmissions] = await Promise.all([
    loadManualOverrides("single-player"),
    loadManualOverrides("source-row"),
    loadManualOverrides("source"),
    loadApprovedEditableSources(),
    loadMmmSubmissionsForPlayerOptions(),
  ]);
  const moderationSources = aggregateSubmittedSources(moderationSubmissions)
    .filter((source) => !approvedSources.some((approved) => approved.slug.trim().toLowerCase() === source.slug.trim().toLowerCase()));
  const submittedSources = [...approvedSources, ...moderationSources]
    .filter((source) => !isSourceOverrideHidden(sourceOverrides.get(source.id)));
  const playerRenameIndexes = buildPlayerRenameIndexes(overrides);
  const playersById = new Map<string, EditableSinglePlayerOption>();
  const playerIdByCanonicalName = new Map<string, string>();
  const sourceContributionsByPlayer = new Map<string, {
    playerId: string;
    username: string;
    lastUpdated: string;
    flagUrl: string | null;
    rowsBySource: Map<string, number>;
  }>();

  const addPlayer = (player: EditableSinglePlayerOption) => {
    if (isSinglePlayerHidden(overrides, player.playerId, player.username)) return;
    upsertExistingPlayerOption(playersById, playerIdByCanonicalName, player);
  };
  const setPlayerSourceAggregate = (player: EditableSinglePlayerOption) => {
    if (isSinglePlayerHidden(overrides, player.playerId, player.username)) return;
    upsertExistingPlayerOption(playersById, playerIdByCanonicalName, player, { preferIncomingStats: true });
  };

  const addSourceContribution = (sourceId: string, row: Record<string, unknown>) => {
    const originalUsername = cleanEditablePlayerName(row.username);
    if (!originalUsername) return;
    const rowPlayerId = staticSourceRowPlayerId(row, originalUsername);
    const username = resolveRenamedPlayerName(playerRenameIndexes, rowPlayerId, originalUsername) || originalUsername;
    if (isSinglePlayerHidden(overrides, rowPlayerId, username)) return;
    const rowOverride = sourceId ? sourceRowOverrides.get(sourceRowOverrideKey(sourceId, rowPlayerId)) : undefined;
    if (isSourceRowHidden(rowOverride)) return;
    const key = normalizePlayerName(username);
    if (!key) return;
    const blocksMined = Math.max(0, Math.floor(toSafeNumber(rowOverride?.blocksMined, toSafeNumber(row.blocksMined, toSafeNumber(row.totalDigs, 0)))));
    const lastUpdated = String(rowOverride?.lastUpdated ?? row.lastUpdated ?? "");
    const existing = sourceContributionsByPlayer.get(key) ?? {
      playerId: rowPlayerId,
      username,
      lastUpdated,
      flagUrl: row.playerFlagUrl ? String(row.playerFlagUrl) : null,
      rowsBySource: new Map<string, number>(),
    };
    const sourceKey = sourceId ? `${sourceId}:${key}` : `${String(row.sourceKey ?? "source")}:${key}`;
    existing.rowsBySource.set(sourceKey, Math.max(existing.rowsBySource.get(sourceKey) ?? 0, blocksMined));
    existing.lastUpdated = latestStringTimestamp(existing.lastUpdated, lastUpdated);
    existing.flagUrl = existing.flagUrl ?? (row.playerFlagUrl ? String(row.playerFlagUrl) : null);
    sourceContributionsByPlayer.set(key, existing);
  };

  for (const row of getStaticMainLeaderboardRows()) {
    const originalUsername = cleanEditablePlayerName(row.username);
    const playerId = staticSourceRowPlayerId(row, originalUsername);
    const username = resolveRenamedPlayerName(playerRenameIndexes, playerId, originalUsername) || originalUsername;
    addPlayer({
      playerId,
      username,
      blocksMined: toSafeNumber(getSinglePlayerOverride(overrides, playerId, originalUsername)?.blocksMined, toSafeNumber(row.blocksMined, 0)),
      rank: Number(row.rank ?? 0),
      sourceCount: Math.max(0, Math.floor(toSafeNumber(row.sourceCount, 0))),
      lastUpdated: String(row.lastUpdated ?? ""),
      flagUrl: row.playerFlagUrl ? String(row.playerFlagUrl) : null,
    });
  }

  for (const source of getStaticPublicSources()) {
    const sourceId = String(source.id ?? "");
    if (isSourceOverrideHidden(sourceOverrides.get(sourceId))) continue;
    const sourceSlug = String(source.slug ?? "");
    for (const row of getStaticSourceLeaderboardRows(sourceSlug) ?? []) {
      addSourceContribution(sourceId, row as Record<string, unknown>);
    }
  }

  for (const row of [...getStaticSpecialLeaderboardRows("ssp"), ...getStaticSpecialLeaderboardRows("hsp")]) {
    const record = row as Record<string, unknown>;
    const originalUsername = cleanEditablePlayerName(record.username);
    const playerId = staticSourceRowPlayerId(record, originalUsername);
    const username = resolveRenamedPlayerName(playerRenameIndexes, playerId, originalUsername) || originalUsername;
    addPlayer({
      playerId,
      username,
      blocksMined: toSafeNumber(record.blocksMined, 0),
      rank: Number(record.rank ?? 0),
      sourceCount: Math.max(0, Math.floor(toSafeNumber(record.sourceCount, 0))),
      lastUpdated: String(record.lastUpdated ?? ""),
      flagUrl: record.playerFlagUrl ? String(record.playerFlagUrl) : null,
    });
  }

  for (const source of getStaticSpecialSources("ssp-hsp")) {
    const sourceId = String(source.id ?? "");
    if (isSourceOverrideHidden(sourceOverrides.get(sourceId))) continue;
    for (const row of Array.isArray(source.rows) ? source.rows as Record<string, unknown>[] : []) {
      addSourceContribution(sourceId, row);
    }
  }

  for (const source of submittedSources) {
    for (const row of source.rows) {
      addSourceContribution(source.id, row as unknown as Record<string, unknown>);
    }
  }

  const allSourceIds = [
    ...getStaticPublicSources()
      .map((source) => String(source.id ?? ""))
      .filter((sourceId) => !isSourceOverrideHidden(sourceOverrides.get(sourceId))),
    ...getStaticSpecialSources("ssp-hsp")
      .map((source) => String(source.id ?? ""))
      .filter((sourceId) => !isSourceOverrideHidden(sourceOverrides.get(sourceId))),
    ...submittedSources.map((source) => source.id),
  ].filter(Boolean).sort((left, right) => right.length - left.length);
  for (const [overrideKey, override] of sourceRowOverrides.entries()) {
    if (override.added !== true || isSourceRowHidden(override)) continue;
    const sourceId = allSourceIds.find((candidate) => overrideKey.startsWith(`${candidate}:`));
    if (!sourceId) continue;
    const playerId = sourceRowPlayerIdFromOverrideKey(sourceId, overrideKey);
    addSourceContribution(sourceId, {
      playerId,
      username: usernameFromManualSourceRowOverride(playerId, override),
      blocksMined: override.blocksMined,
      lastUpdated: override.lastUpdated,
    });
  }

  for (const aggregate of sourceContributionsByPlayer.values()) {
    setPlayerSourceAggregate({
      playerId: aggregate.playerId,
      username: aggregate.username,
      blocksMined: [...aggregate.rowsBySource.values()].reduce((sum, value) => sum + value, 0),
      rank: 0,
      sourceCount: aggregate.rowsBySource.size,
      lastUpdated: aggregate.lastUpdated,
      flagUrl: aggregate.flagUrl,
    });
  }

  return [...playersById.values()].sort((left, right) => left.username.localeCompare(right.username));
}

export async function listEditableSinglePlayers(auth: AuthContext, query: string, limit = 80) {
  requireManagementAccess(auth);
  const search = normalizePlayerName(query);
  const allPlayers = await getAllExistingPlayersForOwnerTools();
  const players = allPlayers
    .filter((player) => !search || normalizePlayerName(player.username).includes(search))
    .sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username))
    .slice(0, limit)
    .map((player, index) => ({ ...player, rank: index + 1 }));

  return {
    ok: true as const,
    players,
  };
}

export async function listEditableSinglePlayerSources(auth: AuthContext, playerId: string, query: string, limit = 120) {
  requireManagementAccess(auth);
  const normalizedPlayerId = sanitizeEditableText(playerId, 120);
  if (!normalizedPlayerId) {
    throw new AdminActionError("Player is required.", 400);
  }
  const search = sanitizeEditableText(query, 80).toLowerCase();
  const overrides = await loadManualOverrides("source-row");
  const playerOverrides = await loadManualOverrides("single-player");
  const sourceOverrides = await loadManualOverrides("source");
  const submittedSources = await loadApprovedEditableSources();
  const playerRenameIndexes = buildPlayerRenameIndexes(playerOverrides);
  if (isSinglePlayerHidden(playerOverrides, normalizedPlayerId)) {
    return { ok: true as const, rows: [] };
  }

  const rowsByName = new Map<string, ReturnType<typeof effectiveSinglePlayerSourceRows>[number] & { flagUrl: string | null }>();
  for (const row of effectiveSinglePlayerSourceRows(normalizedPlayerId, overrides, sourceOverrides, submittedSources, playerRenameIndexes)) {
    if (search && !row.sourceName.toLowerCase().includes(search) && !row.sourceSlug.toLowerCase().includes(search)) {
      continue;
    }
    const usernameKey = row.username.toLowerCase();
    const playerOverride = usernameKey ? playerOverrides.get(`sheet:${usernameKey}`) ?? playerOverrides.get(row.playerId) : undefined;
    const hasFlagOverride = playerOverride && Object.prototype.hasOwnProperty.call(playerOverride, "flagUrl");
    const normalizedName = normalizeSourceName(row.sourceName);
    const existing = rowsByName.get(normalizedName);
    const next = {
      ...row,
      flagUrl: hasFlagOverride ? (typeof playerOverride?.flagUrl === "string" ? playerOverride.flagUrl : null) : null,
    };
    rowsByName.set(normalizedName, existing
      ? {
          ...existing,
          blocksMined: existing.blocksMined + next.blocksMined,
          rank: Math.min(existing.rank || Number.MAX_SAFE_INTEGER, next.rank || Number.MAX_SAFE_INTEGER),
          needsManualReview: Boolean(existing.needsManualReview || next.needsManualReview),
        }
      : next);
  }

  return {
    ok: true as const,
    rows: [...rowsByName.values()]
      .sort((left, right) => right.blocksMined - left.blocksMined || left.sourceName.localeCompare(right.sourceName))
      .slice(0, limit)
      .map((row, index) => ({ ...row, rank: index + 1 })),
  };
}

export async function updateEditableSource(auth: AuthContext, input: { sourceId: string; displayName: string; totalBlocks?: number | null; logoUrl?: string | null; reason?: string | null }) {
  requireManagementAccess(auth);
  const displayName = sanitizeEditableText(input.displayName, 80);
  if (!displayName) {
    throw new AdminActionError("Source name cannot be empty.", 400);
  }
  const totalBlocks = input.totalBlocks == null ? null : parseNonNegativeInteger(input.totalBlocks);
  if (input.totalBlocks != null && totalBlocks == null) {
    throw new AdminActionError("Source total must be a non-negative integer.", 400);
  }
  const logoUrl = sanitizeEditableText(input.logoUrl ?? "", 240) || null;
  await assertUniqueSourceName(input.sourceId, displayName);

  const staticSource = getStaticEditableSources("").find((source) => String(source.id ?? "") === input.sourceId);
  const sourceRowOverrides = await loadManualOverrides("source-row");
  if (staticSource || input.sourceId.includes(":")) {
    const recalculatedTotal = effectiveStaticSourceTotal(input.sourceId, Number(staticSource?.totalBlocks ?? totalBlocks ?? 0), sourceRowOverrides);
    const afterState = {
      displayName,
      totalBlocks: totalBlocks ?? recalculatedTotal,
      logoUrl,
    };
    await upsertManualOverride(auth, "source", input.sourceId, afterState, input.reason ?? null);
    await insertAdminAuditLog({
      actorUserId: auth.userId,
      actorRole: auth.viewer.role,
      actionType: "source.static.edit",
      targetType: "source",
      targetId: input.sourceId,
      beforeState: staticSource ? {
        displayName: staticSource.displayName,
        totalBlocks: Number(staticSource.totalBlocks ?? 0),
        logoUrl: staticSource.logoUrl ?? null,
      } : {},
      afterState,
      reason: input.reason ?? null,
    });
    return {
      ok: true as const,
      source: {
        id: input.sourceId,
        slug: String(staticSource?.slug ?? buildSourceSlug({ displayName, worldKey: input.sourceId })),
        displayName,
        sourceType: String(staticSource?.sourceType ?? "server"),
        isPublic: true,
        isApproved: true,
        totalBlocks: afterState.totalBlocks,
        logoUrl,
        playerCount: Number(staticSource?.playerCount ?? 0),
      },
    };
  }

  const { data: previousRow, error: previousError } = await supabaseAdmin
    .from("sources")
    .select("id,slug,display_name")
    .eq("id", input.sourceId)
    .maybeSingle();
  if (previousError) throw previousError;
  if (!previousRow) {
    throw new AdminActionError("Source not found.", 404);
  }

  const slug = buildSourceSlug({ displayName, worldKey: previousRow.slug });
  const { error } = await supabaseAdmin
    .from("sources")
    .update({
      display_name: displayName,
      slug,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.sourceId);
  if (error) throw error;

  const { error: worldRenameError } = await supabaseAdmin
    .from("worlds_or_servers")
    .update({ display_name: displayName })
    .eq("id", input.sourceId);
  if (worldRenameError) throw worldRenameError;

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "source.edit",
    targetType: "source",
    targetId: input.sourceId,
    beforeState: { displayName: previousRow.display_name, slug: previousRow.slug },
    afterState: { displayName, slug },
    reason: input.reason ?? null,
  });

  return {
    ok: true as const,
    source: {
      id: input.sourceId,
      slug,
      displayName,
    },
  };
}

export async function deleteEditableSource(auth: AuthContext, input: { sourceId: string; reason?: string | null }) {
  requireManagementAccess(auth);
  const sourceId = sanitizeEditableText(input.sourceId, 180);
  if (!sourceId) {
    throw new AdminActionError("Source is required.", 400);
  }
  type DbEditableSource = { id: string; display_name: string | null; slug: string | null };
  const getDbSourceDisplayName = (source: DbEditableSource | null) => source?.display_name;
  const getDbSourceSlug = (source: DbEditableSource | null) => source?.slug;

  const [sourceOverrides, sourceRowOverrides, approvedSources] = await Promise.all([
    loadManualOverrides("source"),
    loadManualOverrides("source-row"),
    loadApprovedEditableSources(),
  ]);
  const existingOverride = sourceOverrides.get(sourceId) ?? {};
  const manualRowFallback = findManualSourceRowFallback(sourceId, sourceRowOverrides);
  const staticSource = findStaticEditableSourceById(sourceId);
  const approvedSource = approvedSources.find((source) => source.id === sourceId);
  const staticSourceCounterpart = !staticSource && approvedSource?.slug
    ? findStaticEditableSourceBySlug(approvedSource.slug)
    : undefined;
  const hasManualSourceRecord = Object.keys(existingOverride).length > 0 || Boolean(manualRowFallback);
  let dbSource: DbEditableSource | null = null;

  if (!staticSource && !approvedSource && !hasManualSourceRecord) {
    const { data, error } = await supabaseAdmin
      .from("sources")
      .select("id,display_name,slug")
      .eq("id", sourceId)
      .maybeSingle();
    if (error && !isMissingSupabaseTableError(error)) throw error;
    dbSource = data as DbEditableSource | null;
  }

  if (!staticSource && !approvedSource && !dbSource && !hasManualSourceRecord) {
    throw new AdminActionError("Source not found.", 404);
  }

  const displayName = sanitizeEditableText(String(
    existingOverride.displayName
      ?? manualRowFallback?.override.sourceName
      ?? staticSource?.displayName
      ?? approvedSource?.displayName
      ?? staticSourceCounterpart?.displayName
      ?? getDbSourceDisplayName(dbSource)
      ?? sourceId,
  ), 80);
  const sourceSlug = String(
    existingOverride.slug
      ?? existingOverride.sourceSlug
      ?? staticSource?.slug
      ?? approvedSource?.slug
      ?? staticSourceCounterpart?.slug
      ?? getDbSourceSlug(dbSource)
      ?? "",
  );
  const now = new Date().toISOString();
  const normalizedSourceSlug = sourceSlug.trim().toLowerCase();
  const sourceIdsToHide = new Set<string>([sourceId]);
  if (normalizedSourceSlug) {
    sourceIdsToHide.add(`submission:${normalizedSourceSlug}`);
    for (const source of approvedSources) {
      if (source.slug.trim().toLowerCase() === normalizedSourceSlug) {
        sourceIdsToHide.add(source.id);
        if (source.replacesStaticSourceId) sourceIdsToHide.add(source.replacesStaticSourceId);
      }
    }
  }
  const staticCounterpartId = String(staticSourceCounterpart?.id ?? "");
  if (staticCounterpartId) sourceIdsToHide.add(staticCounterpartId);

  for (const hiddenSourceId of sourceIdsToHide) {
    const currentOverride = hiddenSourceId === sourceId
      ? existingOverride
      : sourceOverrides.get(hiddenSourceId) ?? {};
    await upsertManualOverride(auth, "source", hiddenSourceId, {
      ...currentOverride,
      displayName,
      slug: sourceSlug,
      hidden: true,
      deleted: true,
      deletedAt: now,
      ...(hiddenSourceId !== sourceId ? { deletedBySourceId: sourceId } : {}),
    }, input.reason ?? null);
  }

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "source.manual-editor.delete",
    targetType: "source",
    targetId: sourceId,
    beforeState: {
      displayName,
      slug: sourceSlug,
      hiddenStaticCounterpartId: staticCounterpartId || null,
      totalBlocks: Number(staticSource?.totalBlocks ?? approvedSource?.totalBlocks ?? 0),
      playerCount: Number(staticSource?.playerCount ?? approvedSource?.rows.length ?? 0),
    },
    afterState: {
      displayName,
      hidden: true,
      deleted: true,
    },
    reason: input.reason ?? null,
  });

  return {
    ok: true as const,
    source: {
      id: sourceId,
      displayName,
      deleted: true as const,
    },
  };
}

export async function updateEditableSourcePlayer(
  auth: AuthContext,
  input: {
    sourceId: string;
    playerId: string;
    username?: string | null;
    blocksMined: number;
    sourceName?: string | null;
    reason?: string | null;
  },
) {
  requireManagementAccess(auth);
  const blocksMined = parseNonNegativeInteger(input.blocksMined);
  if (blocksMined == null) {
    throw new AdminActionError("Blocks mined must be a non-negative integer.", 400);
  }
  const requestedSourceName = input.sourceName == null ? null : sanitizeEditableText(input.sourceName, 80).replace(/\s+/g, " ").trim();
  if (input.sourceName != null && !requestedSourceName) {
    throw new AdminActionError("Source name cannot be empty.", 400);
  }

  const staticRows = getStaticEditableSourceRows(input.sourceId, "");
  const normalizedInputUsername = normalizePlayerName(input.username ?? "");
  const staticRow = staticRows.find((row) => String(row.playerId ?? "") === input.playerId)
    ?? (normalizedInputUsername
      ? staticRows.find((row) => normalizePlayerName(row.username) === normalizedInputUsername)
      : undefined);
  const effectivePlayerId = String(staticRow?.playerId ?? input.playerId);
  if (staticRow || input.sourceId.includes(":")) {
    const sourceRowOverrides = await loadManualOverrides("source-row");
    const sourceOverrides = await loadManualOverrides("source");
    const playerRenameIndexes = await loadPlayerRenameIndex();
    const currentKey = sourceRowOverrideKey(input.sourceId, effectivePlayerId);
    const currentOverride = sourceRowOverrides.get(currentKey) ?? {};
    const currentStaticSource = getStaticEditableSources("").find((source) => String(source.id ?? "") === input.sourceId);
    const currentEffectiveName = sanitizeEditableText(String(currentOverride.sourceName ?? sourceOverrides.get(input.sourceId)?.displayName ?? currentStaticSource?.displayName ?? ""), 80);

    if (requestedSourceName && normalizeSourceName(requestedSourceName) !== normalizeSourceName(currentEffectiveName)) {
      const playerSources = effectiveSinglePlayerSourceRows(effectivePlayerId, sourceRowOverrides, sourceOverrides, [], playerRenameIndexes);
      const mergeTarget = playerSources.find((row) =>
        row.sourceId !== input.sourceId && normalizeSourceName(row.sourceName) === normalizeSourceName(requestedSourceName),
      );

      if (mergeTarget) {
        const targetKey = sourceRowOverrideKey(mergeTarget.sourceId, mergeTarget.playerId);
        const targetOverride = sourceRowOverrides.get(targetKey) ?? {};
        await upsertManualOverride(auth, "source-row", targetKey, {
          ...targetOverride,
          blocksMined: mergeTarget.blocksMined + blocksMined,
          hidden: false,
        }, input.reason ?? null);
        await upsertManualOverride(auth, "source-row", currentKey, {
          ...currentOverride,
          blocksMined: 0,
          hidden: true,
          mergedIntoSourceId: mergeTarget.sourceId,
          mergedIntoSourceName: mergeTarget.sourceName,
        }, input.reason ?? null);
        await clearSinglePlayerBlockOverride(
          auth,
          effectivePlayerId,
          String(staticRow?.username ?? input.username ?? ""),
          input.reason ?? null,
        );
        await insertAdminAuditLog({
          actorUserId: auth.userId,
          actorRole: auth.viewer.role,
          actionType: "leaderboard-entry.static.merge",
          targetType: "leaderboard-entry",
          targetId: currentKey,
          beforeState: {
            username: staticRow?.username ?? input.username ?? input.playerId,
            sourceName: currentEffectiveName,
            blocksMined: toSafeNumber(currentOverride.blocksMined, Number(staticRow?.blocksMined ?? 0)),
          },
          afterState: {
            username: staticRow?.username ?? input.username ?? input.playerId,
            sourceName: mergeTarget.sourceName,
            blocksMined: mergeTarget.blocksMined + blocksMined,
            mergedIntoSourceId: mergeTarget.sourceId,
          },
          reason: input.reason ?? null,
        });
        return {
          ok: true as const,
          row: {
            sourceId: mergeTarget.sourceId,
            playerId: mergeTarget.playerId,
            username: String(staticRow?.username ?? input.username ?? input.playerId),
            sourceName: mergeTarget.sourceName,
            blocksMined: mergeTarget.blocksMined + blocksMined,
            merged: true,
          },
        };
      }

      await updateEditableSource(auth, {
        sourceId: input.sourceId,
        displayName: requestedSourceName,
        totalBlocks: null,
        logoUrl: typeof sourceOverrides.get(input.sourceId)?.logoUrl === "string"
          ? String(sourceOverrides.get(input.sourceId)?.logoUrl)
          : currentStaticSource?.logoUrl ? String(currentStaticSource.logoUrl) : null,
        reason: input.reason ?? null,
      });
    }

    const preservedOverride = { ...currentOverride };
    delete preservedOverride.hidden;
    delete preservedOverride.mergedIntoSourceId;
    delete preservedOverride.mergedIntoSourceName;
    if (requestedSourceName) {
      delete preservedOverride.sourceName;
    }
    const effectiveUsername = cleanEditablePlayerName(input.username ?? staticRow?.username ?? "")
      || usernameFromManualSourceRowOverride(effectivePlayerId, currentOverride);
    await upsertManualOverride(auth, "source-row", currentKey, {
      ...preservedOverride,
      added: currentOverride.added === true || !staticRow,
      playerId: effectivePlayerId,
      username: effectiveUsername,
      blocksMined,
      lastUpdated: new Date().toISOString(),
    }, input.reason ?? null);
    await clearSinglePlayerBlockOverride(
      auth,
      effectivePlayerId,
      effectiveUsername,
      input.reason ?? null,
    );
    await insertAdminAuditLog({
      actorUserId: auth.userId,
      actorRole: auth.viewer.role,
      actionType: "leaderboard-entry.static.edit",
      targetType: "leaderboard-entry",
      targetId: currentKey,
      beforeState: {
        username: effectiveUsername || input.playerId,
        sourceName: currentEffectiveName,
        blocksMined: toSafeNumber(currentOverride.blocksMined, Number(staticRow?.blocksMined ?? 0)),
      },
      afterState: {
        username: effectiveUsername || input.playerId,
        sourceName: requestedSourceName ?? currentEffectiveName,
        blocksMined,
      },
      reason: input.reason ?? null,
    });
    return {
      ok: true as const,
      row: {
        sourceId: input.sourceId,
        playerId: effectivePlayerId,
        username: effectiveUsername || input.playerId,
        sourceName: requestedSourceName ?? currentEffectiveName,
        blocksMined,
      },
    };
  }

  const [entryLookup, playerLookup] = await Promise.all([
    supabaseAdmin
      .from("leaderboard_entries")
      .select("player_id,source_id,score")
      .eq("source_id", input.sourceId)
      .eq("player_id", input.playerId)
      .maybeSingle(),
    supabaseAdmin
      .from("users")
      .select("id,username")
      .eq("id", input.playerId)
      .maybeSingle(),
  ]);

  if (entryLookup.error) throw entryLookup.error;
  if (playerLookup.error) throw playerLookup.error;
  if (!entryLookup.data || !playerLookup.data) {
    throw new AdminActionError("Player source row not found.", 404);
  }

  const nextUsername = input.username != null ? sanitizeEditableText(input.username, 32) : "";
  if (input.username != null && !nextUsername) {
    throw new AdminActionError("Player name cannot be empty.", 400);
  }

  if (input.username != null && nextUsername && nextUsername !== playerLookup.data.username) {
    const { error: playerUpdateError } = await supabaseAdmin
      .from("users")
      .update({
        username: nextUsername,
        username_lower: nextUsername.toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.playerId);
    if (playerUpdateError) throw playerUpdateError;
  }

  if (requestedSourceName) {
    await updateEditableSource(auth, {
      sourceId: input.sourceId,
      displayName: requestedSourceName,
      totalBlocks: null,
      logoUrl: null,
      reason: input.reason ?? null,
    });
  }

  const { error: entryUpdateError } = await supabaseAdmin
    .from("leaderboard_entries")
    .update({
      score: blocksMined,
      rank_cached: null,
      updated_at: new Date().toISOString(),
    })
    .eq("source_id", input.sourceId)
    .eq("player_id", input.playerId);
  if (entryUpdateError) throw entryUpdateError;

  const { error: refreshError } = await supabaseAdmin.rpc("refresh_player_global_leaderboard", {
    p_player_id: input.playerId,
  });
  if (refreshError) throw refreshError;

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "leaderboard-entry.edit",
    targetType: "leaderboard-entry",
    targetId: `${input.sourceId}:${input.playerId}`,
    beforeState: {
      username: playerLookup.data.username,
      blocksMined: entryLookup.data.score ?? 0,
    },
    afterState: {
      username: nextUsername || playerLookup.data.username,
      blocksMined,
    },
    reason: input.reason ?? null,
  });

  return {
    ok: true as const,
    row: {
      sourceId: input.sourceId,
      playerId: input.playerId,
      username: nextUsername || playerLookup.data.username,
      blocksMined,
    },
  };
}

export async function upsertEditableSourcePlayer(
  auth: AuthContext,
  input: {
    sourceId: string;
    playerId?: string | null;
    username?: string | null;
    blocksMined: number;
    sourceName?: string | null;
    createIfMissing?: boolean;
    reason?: string | null;
  },
) {
  requireManagementAccess(auth);
  const blocksMined = parseNonNegativeInteger(input.blocksMined);
  if (blocksMined == null) {
    throw new AdminActionError("Blocks mined must be a non-negative integer.", 400);
  }

  const staticSource = getStaticEditableSources("").find((source) => String(source.id ?? "") === input.sourceId);
  const staticLikeSource = Boolean(staticSource || input.sourceId.includes(":"));
  if (staticLikeSource) {
    const resolved = await resolveEditablePlayerBeforeCreate(auth, {
      playerId: input.playerId ?? null,
      username: input.username ?? null,
      createIfMissing: input.createIfMissing === true,
    });
    return updateEditableSourcePlayer(auth, {
      sourceId: input.sourceId,
      playerId: resolved.playerId,
      username: resolved.username,
      blocksMined,
      sourceName: input.sourceName ?? null,
      reason: input.reason ?? null,
    });
  }

  const resolved = await resolveExistingPlayerBeforeCreate({
    selectedPlayerId: input.playerId ?? null,
    username: input.username ?? null,
    createIfMissing: input.createIfMissing === true,
  });
  if (!resolved) {
    throw new AdminActionError("Select an existing player or choose New Player before saving.", 400);
  }

  const { data: sourceRow, error: sourceError } = await supabaseAdmin
    .from("sources")
    .select("id,display_name")
    .eq("id", input.sourceId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceRow) {
    throw new AdminActionError("Source not found.", 404);
  }

  const previousEntry = await supabaseAdmin
    .from("leaderboard_entries")
    .select("score")
    .eq("source_id", input.sourceId)
    .eq("player_id", resolved.id)
    .maybeSingle();
  if (previousEntry.error) throw previousEntry.error;

  const now = new Date().toISOString();
  const { error: upsertError } = await supabaseAdmin
    .from("leaderboard_entries")
    .upsert({
      source_id: input.sourceId,
      player_id: resolved.id,
      score: blocksMined,
      rank_cached: null,
      updated_at: now,
    }, { onConflict: "player_id,source_id" });
  if (upsertError) throw upsertError;

  const { error: refreshError } = await supabaseAdmin.rpc("refresh_player_global_leaderboard", {
    p_player_id: resolved.id,
  });
  if (refreshError) throw refreshError;

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: previousEntry.data ? "leaderboard-entry.upsert.update" : "leaderboard-entry.upsert.create",
    targetType: "leaderboard-entry",
    targetId: `${input.sourceId}:${resolved.id}`,
    beforeState: {
      username: resolved.username,
      blocksMined: Number(previousEntry.data?.score ?? 0),
    },
    afterState: {
      username: resolved.username,
      blocksMined,
    },
    reason: input.reason ?? null,
  });

  return {
    ok: true as const,
    row: {
      sourceId: input.sourceId,
      playerId: resolved.id,
      username: resolved.username,
      sourceName: String(sourceRow.display_name ?? ""),
      blocksMined,
      created: resolved.created,
    },
  };
}

export async function updateEditableSinglePlayer(auth: AuthContext, input: { playerId: string; blocksMined: number; flagUrl?: string | null; reason?: string | null }) {
  requireManagementAccess(auth);
  const blocksMined = parseNonNegativeInteger(input.blocksMined);
  if (blocksMined == null) {
    throw new AdminActionError("Blocks mined must be a non-negative integer.", 400);
  }
  const player = getStaticEditableSinglePlayers("").find((row) => String(row.playerId ?? "") === input.playerId);
  if (!player) {
    throw new AdminActionError("Single player not found.", 404);
  }
  const flagUrl = sanitizeEditableText(input.flagUrl ?? "", 240) || null;
  const overrides = await loadManualOverrides("single-player");
  const existingOverride = overrides.get(input.playerId) ?? {};
  await upsertManualOverride(auth, "single-player", input.playerId, { ...existingOverride, blocksMined, flagUrl }, input.reason ?? null);
  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "single-player.static.edit",
    targetType: "single-player",
    targetId: input.playerId,
    beforeState: {
      username: player.username,
      blocksMined: Number(player.blocksMined ?? 0),
      flagUrl: player.playerFlagUrl ?? null,
    },
    afterState: {
      username: player.username,
      blocksMined,
      flagUrl,
    },
    reason: input.reason ?? null,
  });
  return {
    ok: true as const,
    player: {
      playerId: input.playerId,
      username: String(player.username ?? ""),
      blocksMined,
      flagUrl,
    },
  };
}

export async function renameEditableSinglePlayer(auth: AuthContext, input: { playerId: string; newUsername: string; reason?: string | null }) {
  requireManagementAccess(auth);
  const playerId = sanitizeEditableText(input.playerId, 160);
  if (!playerId) {
    throw new AdminActionError("Player is required.", 400);
  }

  const newUsername = cleanPlayerRenameName(sanitizeEditableText(input.newUsername, 64));
  if (!newUsername) {
    throw new AdminActionError("New player name cannot be empty.", 400);
  }

  const players = (await listEditableSinglePlayers(auth, "", 10_000)).players;
  const currentPlayer = players.find((player) => player.playerId === playerId);
  if (!currentPlayer) {
    throw new AdminActionError("Single player not found.", 404);
  }

  if (newUsername === currentPlayer.username) {
    throw new AdminActionError("New player name must be different from the current name.", 400);
  }

  const newCanonicalName = normalizePlayerName(newUsername);
  const currentCanonicalName = normalizePlayerName(currentPlayer.username);
  const conflict = players.find((player) =>
    player.playerId !== playerId && normalizePlayerName(player.username) === newCanonicalName,
  );
  if (conflict) {
    throw new AdminActionError(`A player named "${conflict.username}" already exists. Choose a unique name before renaming.`, 409);
  }

  const now = new Date().toISOString();
  const overrides = await loadManualOverrides("single-player");
  const sourceRowOverrides = await loadManualOverrides("source-row");
  const candidateIds = [...new Set([
    playerId,
    `sheet:${currentCanonicalName}`,
    localPlayerId(currentPlayer.username),
  ].filter(Boolean))];

  for (const candidateId of candidateIds) {
    const existingOverride = overrides.get(candidateId) ?? {};
    await upsertManualOverride(auth, "single-player", candidateId, {
      ...existingOverride,
      username: newUsername,
      previousUsername: String(existingOverride.previousUsername ?? currentPlayer.username),
      canonicalOldName: String(existingOverride.canonicalOldName ?? currentCanonicalName),
      renamedAt: now,
    }, input.reason ?? null);
  }

  for (const [overrideKey, override] of sourceRowOverrides.entries()) {
    const rowPlayerId = sanitizeEditableText(String(override.playerId ?? ""), 160);
    const rowUsername = cleanEditablePlayerName(override.username);
    const matchesPlayer = (rowPlayerId && candidateIds.includes(rowPlayerId))
      || candidateIds.some((candidateId) => overrideKey.endsWith(`:${candidateId}`))
      || normalizePlayerName(rowUsername) === currentCanonicalName;
    if (!matchesPlayer) continue;
    await upsertManualOverride(auth, "source-row", overrideKey, {
      ...override,
      username: newUsername,
      lastUpdated: String(override.lastUpdated ?? now),
    }, input.reason ?? null);
  }

  if (!playerId.startsWith("sheet:") && !playerId.startsWith("local-player:") && playerId !== "local-owner-player") {
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        username: newUsername,
        username_lower: newUsername.toLowerCase(),
        canonical_name: newCanonicalName,
        updated_at: now,
      })
      .eq("id", playerId);
    if (error && !isMissingSupabaseTableError(error)) throw error;
  }

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "single-player.global.rename",
    targetType: "single-player",
    targetId: playerId,
    beforeState: {
      username: currentPlayer.username,
      canonicalName: currentCanonicalName,
    },
    afterState: {
      username: newUsername,
      canonicalName: newCanonicalName,
      aliasOverrideIds: candidateIds,
    },
    reason: input.reason ?? null,
  });

  return {
    ok: true as const,
    player: {
      playerId,
      previousUsername: currentPlayer.username,
      username: newUsername,
      blocksMined: currentPlayer.blocksMined,
      sourceCount: currentPlayer.sourceCount,
    },
  };
}

export async function deleteEditableSinglePlayer(auth: AuthContext, input: { playerId: string; username: string; reason?: string | null }) {
  requireManagementAccess(auth);
  const playerId = sanitizeEditableText(input.playerId, 160);
  if (!playerId) {
    throw new AdminActionError("Player is required.", 400);
  }

  const requestedUsername = cleanEditablePlayerName(input.username);
  if (!requestedUsername) {
    throw new AdminActionError("Player name is required.", 400);
  }

  const players = (await listEditableSinglePlayers(auth, "", 10_000)).players;
  const requestedCanonicalName = normalizePlayerName(requestedUsername);
  const currentPlayer = players.find((player) => player.playerId === playerId)
    ?? players.find((player) => normalizePlayerName(player.username) === requestedCanonicalName);
  if (!currentPlayer) {
    throw new AdminActionError("Single player not found.", 404);
  }

  const currentCanonicalName = normalizePlayerName(currentPlayer.username);
  const now = new Date().toISOString();
  const overrides = await loadManualOverrides("single-player");
  const sourceRowOverrides = await loadManualOverrides("source-row");
  const candidateIds = [...new Set([
    playerId,
    currentPlayer.playerId,
    `sheet:${currentCanonicalName}`,
    localPlayerId(currentPlayer.username),
    requestedCanonicalName ? `sheet:${requestedCanonicalName}` : "",
    requestedCanonicalName ? localPlayerId(requestedUsername) : "",
  ].filter(Boolean))];

  for (const candidateId of candidateIds) {
    const existingOverride = overrides.get(candidateId) ?? {};
    await upsertManualOverride(auth, "single-player", candidateId, {
      ...existingOverride,
      username: currentPlayer.username,
      canonicalOldName: String(existingOverride.canonicalOldName ?? currentCanonicalName),
      previousUsername: String(existingOverride.previousUsername ?? currentPlayer.username),
      hidden: true,
      deleted: true,
      deletedAt: now,
    }, input.reason ?? null);
  }

  for (const [overrideKey, override] of sourceRowOverrides.entries()) {
    const rowPlayerId = sanitizeEditableText(String(override.playerId ?? ""), 160);
    const rowUsername = cleanEditablePlayerName(override.username);
    const matchesPlayer = (rowPlayerId && candidateIds.includes(rowPlayerId))
      || candidateIds.some((candidateId) => overrideKey.endsWith(`:${candidateId}`))
      || normalizePlayerName(rowUsername) === currentCanonicalName;
    if (!matchesPlayer) continue;
    await upsertManualOverride(auth, "source-row", overrideKey, {
      ...override,
      username: currentPlayer.username,
      hidden: true,
      deleted: true,
      lastUpdated: String(override.lastUpdated ?? now),
    }, input.reason ?? null);
  }

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "single-player.global.delete",
    targetType: "single-player",
    targetId: playerId,
    beforeState: {
      username: currentPlayer.username,
      canonicalName: currentCanonicalName,
      blocksMined: currentPlayer.blocksMined,
      sourceCount: currentPlayer.sourceCount,
    },
    afterState: {
      username: currentPlayer.username,
      deleted: true,
      aliasOverrideIds: candidateIds,
    },
    reason: input.reason ?? null,
  });

  return {
    ok: true as const,
    player: {
      playerId,
      username: currentPlayer.username,
      deleted: true as const,
    },
  };
}

export async function listRecentAuditEntries(auth: AuthContext) {
  requireManagementAccess(auth);
  const { data, error } = await supabaseAdmin
    .from("admin_audit_log")
    .select("id,action_type,target_type,target_id,reason,created_at,actor_role")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return {
    ok: true as const,
    entries: ((data ?? []) as AuditLogRow[]).map((row) => ({
      id: row.id,
      actionType: row.action_type,
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      createdAt: row.created_at,
      actorRole: row.actor_role,
    })),
  };
}

export async function applySourceModerationAudit(
  auth: AuthContext,
  input: {
    sourceId: string;
    action: "approved" | "rejected" | "delete";
    reason?: string | null;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
  },
) {
  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: `source.${input.action}`,
    targetType: "source",
    targetId: input.sourceId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    reason: sanitizeRejectReason(input.reason ?? ""),
  });
}

export async function setSourceReviewNote(sourceId: string, reason: string | null) {
  const note = sanitizeRejectReason(reason ?? "") || null;
  const { error } = await supabaseAdmin
    .from("worlds_or_servers")
    .update({
      review_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);
  if (error) throw error;
}
