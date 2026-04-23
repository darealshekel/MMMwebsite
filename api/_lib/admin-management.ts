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
import { buildSourceSlug } from "../../shared/source-slug.js";
import type { AuthContext } from "./session.js";
import { hashDeterministicValue, supabaseAdmin } from "./server.js";

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

  const [accountLookup, playerLookup, metadataLookup] = await Promise.all([
    supabaseAdmin
      .from("connected_accounts")
      .select("user_id,minecraft_username,minecraft_uuid_hash")
      .in("minecraft_uuid_hash", hashes)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("players")
      .select("id,username,minecraft_uuid_hash")
      .in("minecraft_uuid_hash", hashes)
      .order("last_seen_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("player_metadata")
      .select("minecraft_uuid_hash,player_id")
      .in("minecraft_uuid_hash", hashes)
      .limit(5),
  ]);

  if (accountLookup.error) throw accountLookup.error;
  if (playerLookup.error) throw playerLookup.error;
  if (metadataLookup.error) throw metadataLookup.error;

  const account = (accountLookup.data ?? [])[0] as
    | { user_id: string; minecraft_username: string; minecraft_uuid_hash: string }
    | undefined;
  const player = (playerLookup.data ?? [])[0] as
    | { id: string; username: string; minecraft_uuid_hash: string | null }
    | undefined;
  const metadata = (metadataLookup.data ?? [])[0] as
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

export async function searchEditableSources(auth: AuthContext, query: string) {
  requireManagementAccess(auth);
  const search = sanitizeEditableText(query, 80);
  const { data, error } = await supabaseAdmin
    .from("sources")
    .select("id,slug,display_name,source_type,is_public,is_approved")
    .or(search ? `display_name.ilike.%${search}%,slug.ilike.%${search}%` : "id.not.is.null")
    .order("display_name", { ascending: true })
    .limit(30);
  if (error) throw error;

  return {
    ok: true as const,
    sources: ((data ?? []) as EditableSourceRow[]).map((row) => ({
      id: row.id,
      slug: row.slug,
      displayName: row.display_name,
      sourceType: row.source_type,
      isPublic: row.is_public,
      isApproved: row.is_approved,
    })),
  };
}

export async function listEditableSourceRows(auth: AuthContext, sourceId: string, query: string) {
  requireManagementAccess(auth);
  const search = sanitizeEditableText(query, 80).toLowerCase();

  const { data, error } = await supabaseAdmin
    .from("leaderboard_entries")
    .select("player_id,score,updated_at,source_id")
    .eq("source_id", sourceId)
    .order("score", { ascending: false })
    .limit(100);
  if (error) throw error;

  const playerIds = [...new Set(((data ?? []) as Array<{ player_id: string | null }>).map((row) => row.player_id).filter(Boolean))];
  const playerLookup = playerIds.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("players").select("id,username,minecraft_uuid_hash").in("id", playerIds);
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
        if (search && !player.username.toLowerCase().includes(search)) return [];
        return [{
          playerId: player.id,
          username: player.username,
          minecraftUuidHash: player.minecraft_uuid_hash ?? null,
          blocksMined: Number(row.score ?? 0),
          lastUpdated: row.updated_at,
          flagUrl: buildFlagAssetUrl(null),
        }];
      }),
  };
}

export async function updateEditableSource(auth: AuthContext, input: { sourceId: string; displayName: string; reason?: string | null }) {
  requireManagementAccess(auth);
  const displayName = sanitizeEditableText(input.displayName, 80);
  if (!displayName) {
    throw new AdminActionError("Source name cannot be empty.", 400);
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

export async function updateEditableSourcePlayer(
  auth: AuthContext,
  input: {
    sourceId: string;
    playerId: string;
    username?: string | null;
    blocksMined: number;
    reason?: string | null;
  },
) {
  requireManagementAccess(auth);
  const blocksMined = parseNonNegativeInteger(input.blocksMined);
  if (blocksMined == null) {
    throw new AdminActionError("Blocks mined must be a non-negative integer.", 400);
  }

  const [entryLookup, playerLookup] = await Promise.all([
    supabaseAdmin
      .from("leaderboard_entries")
      .select("player_id,source_id,score")
      .eq("source_id", input.sourceId)
      .eq("player_id", input.playerId)
      .maybeSingle(),
    supabaseAdmin
      .from("players")
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
      .from("players")
      .update({
        username: nextUsername,
        username_lower: nextUsername.toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.playerId);
    if (playerUpdateError) throw playerUpdateError;
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
