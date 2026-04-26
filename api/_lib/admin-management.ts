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
import {
  getStaticEditableSinglePlayers,
  getStaticEditableSinglePlayerSourceRows,
  getStaticEditableSourceRows,
  getStaticEditableSources,
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

function isMissingSupabaseTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return record.code === "PGRST205" && String(record.message ?? "").includes("Could not find the table");
}

function effectiveStaticSourceTotal(sourceId: string, fallback: number, rowOverrides: Map<string, Record<string, unknown>>) {
  const rows = getStaticEditableSourceRows(sourceId, "");
  let hasRowOverride = false;
  let rowTotal = 0;
  for (const row of rows) {
    const override = rowOverrides.get(`${sourceId}:${String(row.playerId ?? "")}`);
    if (override && Object.prototype.hasOwnProperty.call(override, "blocksMined")) {
      hasRowOverride = true;
    }
    rowTotal += toSafeNumber(override?.blocksMined, Number(row.blocksMined ?? 0));
  }
  return hasRowOverride ? rowTotal : fallback;
}

function isSourceRowHidden(override: Record<string, unknown> | undefined) {
  return override?.hidden === true || Boolean(sanitizeEditableText(String(override?.mergedIntoSourceId ?? ""), 160));
}

function effectiveSinglePlayerSourceRows(
  playerId: string,
  overrides: Map<string, Record<string, unknown>>,
  sourceOverrides: Map<string, Record<string, unknown>>,
  submittedSources: AggregatedEditableSource[] = [],
): EffectiveSinglePlayerSourceRow[] {
  const normalizedPlayerId = playerId.trim().toLowerCase();
  const submittedRows = submittedSources.flatMap((source) =>
    source.rows.flatMap((row) => {
      const rowPlayerId = row.playerId;
      const rowUsername = row.username;
      const matchesPlayer = rowPlayerId.toLowerCase() === normalizedPlayerId
        || `sheet:${rowUsername.toLowerCase()}` === normalizedPlayerId
        || rowUsername.toLowerCase() === normalizedPlayerId.replace(/^sheet:/, "").replace(/^local-player:/, "");
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
        username: rowUsername,
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
    const sourceName = sanitizeEditableText(String(override?.sourceName ?? sourceOverride?.displayName ?? row.sourceName ?? ""), 80);
    const sourceSlug = String(row.sourceSlug ?? "").trim().toLowerCase();
    if (liveReplacementKeys.has(`slug:${sourceSlug}`) || liveReplacementKeys.has(`name:${normalizeSourceName(sourceName)}`)) {
      return [];
    }
    return [{
      sourceId,
      sourceSlug,
      sourceName,
      logoUrl: typeof sourceOverride?.logoUrl === "string" ? sourceOverride.logoUrl : row.logoUrl ? String(row.logoUrl) : null,
      playerId: rowPlayerId,
      username: String(row.username ?? ""),
      blocksMined: toSafeNumber(override?.blocksMined, Number(row.blocksMined ?? 0)),
      rank: Number(row.rank ?? 0),
      lastUpdated: String(row.lastUpdated ?? ""),
      needsManualReview: Boolean(row.needsManualReview),
    }];
  });

  return [...staticRows, ...submittedRows];
}

async function assertUniqueSourceName(sourceId: string, displayName: string) {
  const normalized = normalizeSourceName(displayName);
  const sourceOverrides = await loadManualOverrides("source");
  const staticConflict = getStaticEditableSources("").find((source) => {
    const candidateId = String(source.id ?? "");
    if (candidateId === sourceId) return false;
    const override = sourceOverrides.get(candidateId);
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

function submissionRows(row: MmmSubmissionRow) {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  const rawRows = Array.isArray(payload.playerRows) ? payload.playerRows : [];
  return rawRows.flatMap((entry): Array<{ username: string; blocksMined: number }> => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const username = sanitizeEditableText(String(record.username ?? ""), 32);
    const blocksMined = Number(record.blocksMined ?? 0);
    return username && Number.isFinite(blocksMined) && blocksMined > 0 ? [{ username, blocksMined: Math.floor(blocksMined) }] : [];
  });
}

function isServerSubmissionType(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  return normalized === "private-server" || normalized === "server";
}

function localPlayerId(username: string) {
  return username.toLowerCase() === "5hekel" ? "local-owner-player" : `local-player:${username.toLowerCase()}`;
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
      const key = row.username.toLowerCase();
      const existing = bucket.rows.get(key);
      if (!existing || row.blocksMined > existing.blocksMined || submission.created_at > existing.lastUpdated) {
        bucket.rows.set(key, {
          username: row.username,
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
      const username = sanitizeEditableText(String(record.username ?? ""), 32);
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
    .sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  if (!rows.length) return null;

  return {
    id,
    slug,
    displayName,
    sourceType: sanitizeEditableText(String(source.sourceType ?? "server"), 40) || "server",
    logoUrl: typeof source.logoUrl === "string" ? source.logoUrl : null,
    createdAt: String(source.createdAt ?? rows[0]?.lastUpdated ?? ""),
    totalBlocks: rows.reduce((sum, row) => sum + row.blocksMined, 0),
    rows,
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

export async function searchEditableSources(auth: AuthContext, query: string) {
  requireManagementAccess(auth);
  const search = sanitizeEditableText(query, 80);
  const overrides = await loadManualOverrides("source");
  const rowOverrides = await loadManualOverrides("source-row");
  const approvedEditableSources = await loadApprovedEditableSources();
  const approvedSourcesBySlug = new Map(
    approvedEditableSources
      .filter((source) => source.liveApprovedSource === true)
      .map((source) => [source.slug.trim().toLowerCase(), source]),
  );
  const staticSourceSlugs = new Set<string>();
  const staticSources = getStaticEditableSources(search).map((source) => {
    const sourceId = String(source.id ?? "");
    const staticSlug = String(source.slug ?? "").trim().toLowerCase();
    staticSourceSlugs.add(staticSlug);
    const liveReplacement = approvedSourcesBySlug.get(staticSlug);
    if (liveReplacement) {
      return {
        id: liveReplacement.id,
        slug: liveReplacement.slug,
        displayName: liveReplacement.displayName,
        sourceType: liveReplacement.sourceType || String(source.sourceType ?? "server"),
        isPublic: true,
        isApproved: true,
        logoUrl: liveReplacement.logoUrl ?? source.logoUrl ?? null,
        totalBlocks: liveReplacement.totalBlocks,
        playerCount: liveReplacement.rows.length,
      };
    }
    const override = overrides.get(String(source.id ?? ""));
    const sourceTotal = effectiveStaticSourceTotal(
      sourceId,
      toSafeNumber(override?.totalBlocks, Number(source.totalBlocks ?? 0)),
      rowOverrides,
    );
    return {
      id: sourceId,
      slug: String(source.slug ?? ""),
      displayName: sanitizeEditableText(String(override?.displayName ?? source.displayName ?? ""), 80),
      sourceType: String(source.sourceType ?? "server"),
      isPublic: true,
      isApproved: true,
      logoUrl: typeof override?.logoUrl === "string" ? override.logoUrl : source.logoUrl ?? null,
      totalBlocks: sourceTotal,
      playerCount: Number(source.playerCount ?? 0),
    };
  });

  const submittedSources = approvedEditableSources.flatMap((submission) => {
    const displayName = sanitizeEditableText(submission.displayName, 80);
    if (!displayName) return [];
    if (staticSourceSlugs.has(submission.slug.trim().toLowerCase())) return [];
    if (search && !displayName.toLowerCase().includes(search.toLowerCase())) return [];
    return [{
      id: submission.id,
      slug: submission.slug,
      displayName,
      sourceType: submission.sourceType || "server",
      isPublic: true,
      isApproved: true,
      totalBlocks: submission.totalBlocks,
      logoUrl: submission.logoUrl ?? null,
      playerCount: submission.rows.length,
    }];
  });

  return {
    ok: true as const,
    sources: [...staticSources, ...submittedSources],
  };
}

export async function listEditableSourceRows(auth: AuthContext, sourceId: string, query: string) {
  requireManagementAccess(auth);
  const search = sanitizeEditableText(query, 80).toLowerCase();
  const overrides = await loadManualOverrides("source-row");
  const playerOverrides = await loadManualOverrides("single-player");
  if (sourceId.startsWith("submission:")) {
    const submission = aggregateSubmittedSources(await loadApprovedMmmSubmissions()).find((row) => row.id === sourceId);
    if (!submission) return { ok: true as const, rows: [] };
    const rows = submission.rows
      .filter((row) => !search || row.username.toLowerCase().includes(search))
      .sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username))
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
  const staticRows = getStaticEditableSourceRows(sourceId, search).map((row) => {
    const key = `${sourceId}:${String(row.playerId ?? "")}`;
    const override = overrides.get(key);
    const usernameKey = String(row.username ?? "").toLowerCase();
    const playerOverride = usernameKey ? playerOverrides.get(`sheet:${usernameKey}`) ?? playerOverrides.get(String(row.playerId ?? "")) : undefined;
    const hasFlagOverride = playerOverride && Object.prototype.hasOwnProperty.call(playerOverride, "flagUrl");
    return {
      playerId: String(row.playerId ?? ""),
      username: String(row.username ?? ""),
      minecraftUuidHash: null,
      blocksMined: toSafeNumber(override?.blocksMined, Number(row.blocksMined ?? 0)),
      lastUpdated: String(row.lastUpdated ?? ""),
      flagUrl: hasFlagOverride
        ? (typeof playerOverride?.flagUrl === "string" ? playerOverride.flagUrl : null)
        : typeof override?.flagUrl === "string" ? override.flagUrl : row.playerFlagUrl ? String(row.playerFlagUrl) : null,
    };
  }).filter((row) => !isSourceRowHidden(overrides.get(`${sourceId}:${row.playerId}`)))
    .sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username));

  if (staticRows.length > 0 || sourceId.includes(":")) {
    return {
      ok: true as const,
      rows: staticRows,
    };
  }

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

export async function listEditableSinglePlayers(auth: AuthContext, query: string) {
  requireManagementAccess(auth);
  const search = sanitizeEditableText(query, 80).toLowerCase();
  const overrides = await loadManualOverrides("single-player");
  const sourceRowOverrides = await loadManualOverrides("source-row");
  const sourceOverrides = await loadManualOverrides("source");
  const submittedSources = await loadApprovedEditableSources();
  const playersById = new Map<string, {
    playerId: string;
    username: string;
    blocksMined: number;
    rank: number;
    sourceCount: number;
    lastUpdated: string;
    flagUrl: string | null;
  }>();

  for (const row of getStaticEditableSinglePlayers(search)) {
    const playerId = String(row.playerId ?? "");
    const override = overrides.get(playerId);
    const rawSourceRows = getStaticEditableSinglePlayerSourceRows(playerId, "");
    const hasSourceRowOverride = rawSourceRows.some((sourceRow) =>
      Boolean(sourceRowOverrides.get(`${String(sourceRow.sourceId ?? "")}:${String(sourceRow.playerId ?? "")}`)),
    );
    const playerSourceRows = effectiveSinglePlayerSourceRows(playerId, sourceRowOverrides, sourceOverrides, submittedSources);
    const hasSubmittedRows = playerSourceRows.some((sourceRow) =>
      String(sourceRow.sourceId).startsWith("submission:") || sourceRow.liveApprovedSource === true,
    );
    const derivedBlocks = playerSourceRows.reduce((sum, sourceRow) => sum + sourceRow.blocksMined, 0);
    playersById.set(playerId, {
      playerId,
      username: String(row.username ?? ""),
      blocksMined: hasSourceRowOverride || hasSubmittedRows
        ? derivedBlocks
        : toSafeNumber(override?.blocksMined, Number(row.blocksMined ?? 0)),
      rank: Number(row.rank ?? 0),
      sourceCount: hasSourceRowOverride || hasSubmittedRows ? playerSourceRows.length : Number(row.sourceCount ?? 0),
      lastUpdated: String(row.lastUpdated ?? ""),
      flagUrl: typeof override?.flagUrl === "string" ? override.flagUrl : row.playerFlagUrl ? String(row.playerFlagUrl) : null,
    });
  }

  for (const source of submittedSources) {
    for (const row of source.rows) {
      if (search && !row.username.toLowerCase().includes(search)) continue;
      const existing = playersById.get(row.playerId);
      if (existing) continue;
      const playerSourceRows = effectiveSinglePlayerSourceRows(row.playerId, sourceRowOverrides, sourceOverrides, submittedSources);
      playersById.set(row.playerId, {
        playerId: row.playerId,
        username: row.username,
        blocksMined: playerSourceRows.reduce((sum, sourceRow) => sum + sourceRow.blocksMined, 0),
        rank: 0,
        sourceCount: playerSourceRows.length,
        lastUpdated: row.lastUpdated,
        flagUrl: null,
      });
    }
  }

  const players = [...playersById.values()]
    .sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username))
    .map((player, index) => ({ ...player, rank: index + 1 }));

  return {
    ok: true as const,
    players,
  };
}

export async function listEditableSinglePlayerSources(auth: AuthContext, playerId: string, query: string) {
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

  const rowsByName = new Map<string, ReturnType<typeof effectiveSinglePlayerSourceRows>[number] & { flagUrl: string | null }>();
  for (const row of effectiveSinglePlayerSourceRows(normalizedPlayerId, overrides, sourceOverrides, submittedSources)) {
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
  const staticRow = staticRows.find((row) => String(row.playerId ?? "") === input.playerId);
  if (staticRow || input.sourceId.includes(":")) {
    const sourceRowOverrides = await loadManualOverrides("source-row");
    const sourceOverrides = await loadManualOverrides("source");
    const currentKey = `${input.sourceId}:${input.playerId}`;
    const currentOverride = sourceRowOverrides.get(currentKey) ?? {};
    const currentStaticSource = getStaticEditableSources("").find((source) => String(source.id ?? "") === input.sourceId);
    const currentEffectiveName = sanitizeEditableText(String(currentOverride.sourceName ?? sourceOverrides.get(input.sourceId)?.displayName ?? currentStaticSource?.displayName ?? ""), 80);

    if (requestedSourceName && normalizeSourceName(requestedSourceName) !== normalizeSourceName(currentEffectiveName)) {
      const playerSources = effectiveSinglePlayerSourceRows(input.playerId, sourceRowOverrides, sourceOverrides);
      const mergeTarget = playerSources.find((row) =>
        row.sourceId !== input.sourceId && normalizeSourceName(row.sourceName) === normalizeSourceName(requestedSourceName),
      );

      if (mergeTarget) {
        const targetKey = `${mergeTarget.sourceId}:${mergeTarget.playerId}`;
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
          input.playerId,
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
    await upsertManualOverride(auth, "source-row", currentKey, {
      ...preservedOverride,
      blocksMined,
    }, input.reason ?? null);
    await clearSinglePlayerBlockOverride(
      auth,
      input.playerId,
      String(staticRow?.username ?? input.username ?? ""),
      input.reason ?? null,
    );
    await insertAdminAuditLog({
      actorUserId: auth.userId,
      actorRole: auth.viewer.role,
      actionType: "leaderboard-entry.static.edit",
      targetType: "leaderboard-entry",
      targetId: currentKey,
      beforeState: {
        username: staticRow?.username ?? input.playerId,
        sourceName: currentEffectiveName,
        blocksMined: toSafeNumber(currentOverride.blocksMined, Number(staticRow?.blocksMined ?? 0)),
      },
      afterState: {
        username: staticRow?.username ?? input.playerId,
        sourceName: requestedSourceName ?? currentEffectiveName,
        blocksMined,
      },
      reason: input.reason ?? null,
    });
    return {
      ok: true as const,
      row: {
        sourceId: input.sourceId,
        playerId: input.playerId,
        username: String(staticRow?.username ?? input.username ?? input.playerId),
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
  await upsertManualOverride(auth, "single-player", input.playerId, { blocksMined, flagUrl }, input.reason ?? null);
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
