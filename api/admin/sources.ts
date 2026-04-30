import type { SourceApprovalSummary } from "../../src/lib/types.js";
import { sanitizeEditableText } from "../../shared/admin-management.js";
import { canonicalPlayerName, cleanPlayerDisplayName as cleanCanonicalPlayerDisplayName } from "../../shared/player-identity.js";
import { buildSourceDisplayName, buildSourceSlug, buildSourceType } from "../../shared/source-slug.js";
import { applySourceModerationAudit, setSourceReviewNote, AdminActionError } from "../_lib/admin-management.js";
import { submitSourceScore } from "../_lib/leaderboard.js";
import { hasManagementRole, getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError, supabaseAdmin } from "../_lib/server.js";
import { buildSourceRollups, loadSourceApprovalData } from "../_lib/source-approval.js";
import { refreshStaticManualOverridesSnapshot } from "../_lib/static-mmm-overrides.js";
import { invalidateDashboardSnapshotCache } from "../_lib/dashboard.js";

export const config = { runtime: "edge" };

function sourceApprovalResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  return jsonResponse(body, {
    ...init,
    headers,
  });
}

function toSummary(
  sources: ReturnType<typeof buildSourceRollups>,
  players: Array<{ id: string; username: string }>,
): SourceApprovalSummary[] {
  const playerById = new Map(players.map((player) => [player.id, player.username]));

  return sources
    .map((source) => ({
      id: source.id,
      displayName: source.displayName,
      worldKey: source.worldKey,
      kind: source.kind,
      sourceScope: source.sourceScope,
      totalBlocks: source.totalBlocks,
      playerCount: source.playerCount,
      submittedByUsername: source.submittedByPlayerId
        ? playerById.get(source.submittedByPlayerId) ?? null
        : null,
      submittedAt: source.submittedAt,
      firstSeenAt: source.firstSeenAt,
      lastSeenAt: source.lastSeenAt,
      approvalStatus: source.approvalStatus,
      eligibleForPublic: source.approvalStatus === "approved" && source.sourceScope === "public_server",
      scanEvidence: {
        scoreboardTitle: source.scoreboardTitle,
        sampleSidebarLines: source.sampleSidebarLines,
        detectedStatFields: source.detectedStatFields,
        confidence: source.scanConfidence,
        iconUrl: source.iconUrl,
        rawScanEvidence: source.rawScanEvidence,
      },
    }));
}

type SubmissionRow = {
  id: string;
  user_id: string;
  minecraft_uuid_hash: string;
  minecraft_username: string;
  submission_type: "edit-existing-source" | "add-new-source";
  target_source_id: string | null;
  target_source_slug: string | null;
  source_name: string;
  source_type: string;
  submitted_blocks_mined: number;
  proof_file_name: string;
  proof_mime_type: string;
  proof_size: number;
  proof_image_ref: string;
  logo_url: string | null;
  payload: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
};

type SubmissionPlayerRow = {
  playerId: string | null;
  username: string;
  blocksMined: number;
};

type PlayerIdentityRow = {
  id: string;
  username: string | null;
  username_lower?: string | null;
  canonical_name?: string | null;
};

function isMissingSupabaseTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return record.code === "PGRST205" && String(record.message ?? "").includes("Could not find the table");
}

function sourceScopeForSubmission(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  if (normalized === "private-server" || normalized === "server") return "public_server";
  if (normalized === "singleplayer" || normalized === "hardcore" || normalized === "ssp" || normalized === "hsp") return "private_singleplayer";
  return "unsupported";
}

function kindForSubmission(sourceType: string): SourceApprovalSummary["kind"] {
  const normalized = sourceType.trim().toLowerCase();
  if (normalized === "private-server" || normalized === "server") return "multiplayer";
  if (normalized === "singleplayer" || normalized === "hardcore" || normalized === "ssp" || normalized === "hsp") return "singleplayer";
  return "unknown";
}

function submissionPlayerRows(row: SubmissionRow) {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  const rawRows = Array.isArray(payload.playerRows) ? payload.playerRows : [];
  const rows = rawRows.flatMap((entry): SubmissionPlayerRow[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const playerId = sanitizeEditableText(String(record.playerId ?? ""), 120) || null;
    const username = sanitizeEditableText(String(record.username ?? ""), 32);
    const blocksMined = Number(record.blocksMined ?? 0);
    return username && Number.isFinite(blocksMined) && blocksMined > 0
      ? [{ playerId, username, blocksMined: Math.floor(blocksMined) }]
      : [];
  });
  return rows.length > 0
    ? rows
    : [{ playerId: null, username: row.minecraft_username, blocksMined: Number(row.submitted_blocks_mined ?? 0) }];
}

function submissionToSummary(row: SubmissionRow, resolvedPlayerRows = submissionPlayerRows(row)): SourceApprovalSummary {
  const playerRows = resolvedPlayerRows;
  const totalBlocks = playerRows.reduce((sum, player) => sum + player.blocksMined, 0);
  return {
    id: `submission:${row.id}`,
    displayName: row.source_name,
    worldKey: row.target_source_slug ?? row.id,
    kind: kindForSubmission(row.source_type),
    sourceScope: sourceScopeForSubmission(row.source_type),
    totalBlocks,
    playerCount: playerRows.length,
    submittedByUsername: row.minecraft_username,
    submittedByUserId: row.user_id,
    submittedAt: row.created_at,
    firstSeenAt: row.created_at,
    lastSeenAt: row.created_at,
    approvalStatus: row.status,
    eligibleForPublic: row.status === "approved" && sourceScopeForSubmission(row.source_type) === "public_server",
    moderationKind: "submission",
    sourceType: row.source_type,
    proofImageRef: row.proof_image_ref,
    proofFileName: row.proof_file_name,
    proofMimeType: row.proof_mime_type,
    proofSize: row.proof_size,
    reviewNote: row.review_note,
    playerRows,
    scanEvidence: {
      scoreboardTitle: row.source_name,
      sampleSidebarLines: [],
      detectedStatFields: [],
      confidence: 1,
      iconUrl: row.logo_url,
      rawScanEvidence: row.payload ?? null,
    },
  };
}

async function loadSubmissionPlayerIdentities(submissions: SubmissionRow[]) {
  const rawRows = submissions.flatMap(submissionPlayerRows);
  const playerIds = [...new Set(rawRows.map((row) => row.playerId).filter((value): value is string => Boolean(value)))];
  const canonicalNames = [...new Set(rawRows.map((row) => normalizePlayerIdentity(row.username)).filter(Boolean))];

  const [byIdResult, byNameResult] = await Promise.all([
    playerIds.length
      ? supabaseAdmin
          .from("users")
          .select("id,username,username_lower,canonical_name")
          .in("id", playerIds)
      : Promise.resolve({ data: [], error: null } as const),
    canonicalNames.length
      ? supabaseAdmin
          .from("users")
          .select("id,username,username_lower,canonical_name")
          .in("canonical_name", canonicalNames)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (byIdResult.error) throw byIdResult.error;
  if (byNameResult.error) throw byNameResult.error;

  const byId = new Map<string, PlayerIdentityRow>();
  for (const row of (byIdResult.data ?? []) as PlayerIdentityRow[]) {
    if (row.id) byId.set(row.id, row);
  }

  const byCanonical = new Map<string, PlayerIdentityRow>();
  for (const row of (byNameResult.data ?? []) as PlayerIdentityRow[]) {
    const key = normalizePlayerIdentity(row.canonical_name ?? row.username_lower ?? row.username ?? "");
    if (key && !byCanonical.has(key)) byCanonical.set(key, row);
  }

  return { byId, byCanonical };
}

function resolveSubmissionRowsForSummary(
  submission: SubmissionRow,
  players: Awaited<ReturnType<typeof loadSubmissionPlayerIdentities>>,
) {
  const merged = new Map<string, SubmissionPlayerRow>();

  for (const row of submissionPlayerRows(submission)) {
    const canonicalName = normalizePlayerIdentity(row.username);
    const resolved = row.playerId
      ? players.byId.get(row.playerId) ?? players.byCanonical.get(canonicalName)
      : players.byCanonical.get(canonicalName);
    const key = resolved?.id ? `id:${resolved.id}` : `name:${canonicalName}`;
    if (!canonicalName && !resolved?.id) continue;
    const username = cleanPlayerDisplayName(resolved?.username ?? row.username);
    const existing = merged.get(key);
    merged.set(key, {
      playerId: resolved?.id ?? row.playerId ?? null,
      username: username || row.username,
      blocksMined: Math.max(existing?.blocksMined ?? 0, row.blocksMined),
    });
  }

  return [...merged.values()].sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username));
}

async function loadSubmissionApprovals() {
  const { data, error } = await supabaseAdmin
    .from("mmm_submissions")
    .select("id,user_id,minecraft_uuid_hash,minecraft_username,submission_type,target_source_id,target_source_slug,source_name,source_type,submitted_blocks_mined,proof_file_name,proof_mime_type,proof_size,proof_image_ref,logo_url,payload,status,review_note,created_at")
    .in("status", ["pending", "approved", "rejected"])
    .order("created_at", { ascending: false })
    .limit(160);
  if (error) {
    if (isMissingSupabaseTableError(error)) return [];
    throw error;
  }
  const submissions = (data ?? []) as SubmissionRow[];
  const playerIdentities = await loadSubmissionPlayerIdentities(submissions);
  return submissions.map((submission) => submissionToSummary(submission, resolveSubmissionRowsForSummary(submission, playerIdentities)));
}

async function loadWorldApprovals() {
  try {
    const data = await loadSourceApprovalData();
    return toSummary(
      buildSourceRollups(data.worlds, data.worldStats, data.aeternumAggregates, {
        preferAeternumForAdmin: true,
        canonicalSourceAggregates: data.canonicalSourceAggregates,
      }),
      data.players,
    )
      .map((source) => ({ ...source, moderationKind: "world" as const }));
  } catch (error) {
    if (isMissingSupabaseTableError(error)) return [];
    throw error;
  }
}

async function combinedApprovalResponse() {
  const [worldSources, submittedSources] = await Promise.all([
    loadWorldApprovals(),
    loadSubmissionApprovals(),
  ]);
  return {
    sources: await annotateExistingSourceMatches([...submittedSources, ...worldSources]),
    minimumBlocks: 0,
  };
}

function submissionIdFromSourceId(sourceId: string) {
  return sourceId.startsWith("submission:") ? sourceId.slice("submission:".length) : null;
}

function isServerSubmissionType(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  return normalized === "private-server" || normalized === "server";
}

function approvedSubmissionSourceSlug(row: Pick<SubmissionRow, "id" | "source_name" | "source_type">) {
  const displayName = sanitizeEditableText(row.source_name, 80) || row.id;
  return isServerSubmissionType(row.source_type)
    ? buildSourceSlug({ displayName })
    : buildSourceSlug({ displayName, worldKey: row.id });
}

type ExistingSourceRow = {
  id: string;
  slug: string;
  display_name: string;
  source_type?: string | null;
  is_public?: boolean | null;
  is_approved?: boolean | null;
  updated_at?: string | null;
};

function normalizeSourceIdentity(value: string | null | undefined) {
  return sanitizeEditableText(value ?? "", 120).trim().toLowerCase();
}

function cleanPlayerDisplayName(value: string) {
  return cleanCanonicalPlayerDisplayName(sanitizeEditableText(value, 64)).slice(0, 32);
}

function normalizePlayerIdentity(value: string) {
  return canonicalPlayerName(value);
}

function sourceSlugForModerationSummary(source: SourceApprovalSummary) {
  if (source.moderationKind === "submission") {
    return isServerSubmissionType(source.sourceType ?? "")
      ? buildSourceSlug({ displayName: source.displayName })
      : buildSourceSlug({ displayName: source.displayName, worldKey: source.worldKey });
  }

  return buildSourceSlug({
    displayName: source.displayName,
    worldKey: source.worldKey,
  });
}

async function findExistingSourceForApproval(sourceSlug: string, sourceDisplayName: string): Promise<ExistingSourceRow | null> {
  const slug = sanitizeEditableText(sourceSlug, 120);
  const displayNameKey = normalizeSourceIdentity(sourceDisplayName);

  if (slug) {
    const bySlug = await supabaseAdmin
      .from("sources")
      .select("id,slug,display_name,source_type,is_public,is_approved,updated_at")
      .eq("slug", slug)
      .maybeSingle();
    if (bySlug.error) throw bySlug.error;
    if (bySlug.data) return bySlug.data as ExistingSourceRow;
  }

  if (!displayNameKey) return null;

  const byName = await supabaseAdmin
    .from("sources")
    .select("id,slug,display_name,source_type,is_public,is_approved,updated_at")
    .limit(1000);
  if (byName.error) throw byName.error;

  return ((byName.data ?? []) as ExistingSourceRow[])
    .filter((row) => normalizeSourceIdentity(row.display_name) === displayNameKey)
    .sort((left, right) =>
      Number(Boolean(right.is_approved)) - Number(Boolean(left.is_approved)) ||
      Number(Boolean(right.is_public)) - Number(Boolean(left.is_public)) ||
      new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime(),
    )[0] ?? null;
}

async function resolveSourceForApproval(input: {
  sourceSlug: string;
  sourceDisplayName: string;
  sourceType: string;
  isPublic: boolean;
}) {
  const now = new Date().toISOString();
  const existing = await findExistingSourceForApproval(input.sourceSlug, input.sourceDisplayName);

  if (existing) {
    const updated = await supabaseAdmin
      .from("sources")
      .update({
        display_name: input.sourceDisplayName || existing.display_name,
        source_type: input.sourceType || existing.source_type || "server",
        is_public: Boolean(existing.is_public) || input.isPublic,
        is_approved: true,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("id,slug,display_name,source_type,is_public,is_approved,updated_at")
      .single();
    if (updated.error) throw updated.error;
    return updated.data as ExistingSourceRow;
  }

  const inserted = await supabaseAdmin
    .from("sources")
    .upsert({
      slug: input.sourceSlug,
      display_name: input.sourceDisplayName,
      source_type: input.sourceType,
      is_public: input.isPublic,
      is_approved: true,
      updated_at: now,
    }, { onConflict: "slug" })
    .select("id,slug,display_name,source_type,is_public,is_approved,updated_at")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data as ExistingSourceRow;
}

async function annotateExistingSourceMatches(sources: SourceApprovalSummary[]) {
  const pending = sources.filter((source) => source.approvalStatus === "pending");
  if (pending.length === 0) return sources;

  const existingLookup = await supabaseAdmin
    .from("sources")
    .select("id,slug,display_name,source_type,is_public,is_approved,updated_at")
    .limit(5000);
  if (existingLookup.error) throw existingLookup.error;

  const bySlug = new Map<string, ExistingSourceRow>();
  const byName = new Map<string, ExistingSourceRow[]>();
  for (const row of (existingLookup.data ?? []) as ExistingSourceRow[]) {
    const slug = sanitizeEditableText(row.slug ?? "", 120).trim().toLowerCase();
    if (slug && !bySlug.has(slug)) {
      bySlug.set(slug, row);
    }
    const nameKey = normalizeSourceIdentity(row.display_name);
    if (!nameKey) continue;
    const list = byName.get(nameKey) ?? [];
    list.push(row);
    byName.set(nameKey, list);
  }

  for (const list of byName.values()) {
    list.sort((left, right) =>
      Number(Boolean(right.is_approved)) - Number(Boolean(left.is_approved)) ||
      Number(Boolean(right.is_public)) - Number(Boolean(left.is_public)) ||
      new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime(),
    );
  }

  const existingBySourceId = new Map(pending.map((source) => {
    const slug = sourceSlugForModerationSummary(source).trim().toLowerCase();
    const displayNameKey = normalizeSourceIdentity(source.displayName);
    const existing = bySlug.get(slug) ?? byName.get(displayNameKey)?.[0] ?? null;
    return [
      source.id,
      existing
        ? {
            id: existing.id,
            slug: existing.slug,
            displayName: existing.display_name,
            isPublic: Boolean(existing.is_public),
            isApproved: Boolean(existing.is_approved),
          }
        : null,
    ] as const;
  }));

  return sources.map((source) => {
    const existingSource = existingBySourceId.get(source.id);
    return existingSource ? { ...source, existingSource } : source;
  });
}

async function resolveSubmissionPlayerId(submission: SubmissionRow, row: SubmissionPlayerRow, now: string) {
  const selectedPlayerId = sanitizeEditableText(row.playerId ?? "", 120);
  if (selectedPlayerId) {
    const byId = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("id", selectedPlayerId)
      .maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data?.id) return String(byId.data.id);
  }

  const cleanUsername = cleanPlayerDisplayName(row.username);
  if (!cleanUsername) return null;
  const usernameLower = normalizePlayerIdentity(cleanUsername);
  const submissionOwner = cleanUsername.toLowerCase() === sanitizeEditableText(submission.minecraft_username, 32).toLowerCase();

  if (submissionOwner && submission.minecraft_uuid_hash) {
    const byUuid = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("minecraft_uuid_hash", submission.minecraft_uuid_hash)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byUuid.error) throw byUuid.error;
    if (byUuid.data?.id) return String(byUuid.data.id);
  }

  const byUsername = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("canonical_name", usernameLower)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byUsername.error) throw byUsername.error;
  if (byUsername.data?.id) return String(byUsername.data.id);

  const inserted = await supabaseAdmin
    .from("users")
    .insert({
      client_id: `mmm-submission:${submission.id}:${usernameLower}`,
      username: cleanUsername,
      username_lower: usernameLower,
      canonical_name: usernameLower,
      minecraft_uuid_hash: submissionOwner ? submission.minecraft_uuid_hash : null,
      last_seen_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (inserted.error) {
    const retryByUsername = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("canonical_name", usernameLower)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (retryByUsername.error) throw retryByUsername.error;
    if (retryByUsername.data?.id) return String(retryByUsername.data.id);
    throw inserted.error;
  }
  return inserted.data?.id ? String(inserted.data.id) : null;
}

async function materializeApprovedSubmission(submission: SubmissionRow) {
  const sourceName = sanitizeEditableText(submission.source_name, 80);
  if (!sourceName) return;

  const now = new Date().toISOString();
  const sourceSlug = submission.submission_type === "edit-existing-source"
    ? sanitizeEditableText(submission.target_source_slug ?? "", 120) || buildSourceSlug({ displayName: sourceName })
    : approvedSubmissionSourceSlug(submission);
  const isPublic = sourceScopeForSubmission(submission.source_type) === "public_server";
  const sourceType = submission.source_type || "server";
  const approvedSource = await resolveSourceForApproval({
    sourceSlug,
    sourceDisplayName: sourceName,
    sourceType,
    isPublic,
  });
  const materializedSourceSlug = approvedSource.slug;
  const rows = submission.submission_type === "edit-existing-source"
    ? [{ playerId: null, username: submission.minecraft_username, blocksMined: Number(submission.submitted_blocks_mined ?? 0) }]
    : submissionPlayerRows(submission);
  const materializedPlayerIds: string[] = [];

  for (const row of rows) {
    const playerId = await resolveSubmissionPlayerId(submission, row, now);
    if (!playerId) continue;
    materializedPlayerIds.push(playerId);
    await submitSourceScore({
      playerId,
      sourceSlug: materializedSourceSlug,
      sourceDisplayName: sourceName,
      sourceType,
      score: row.blocksMined,
      isPublic,
    });
  }

  for (const playerId of [...new Set(materializedPlayerIds)]) {
    const refresh = await supabaseAdmin.rpc("refresh_player_global_leaderboard", { p_player_id: playerId });
    if (refresh.error) throw refresh.error;
  }
}
async function updateSubmissionStatus(
  authUserId: string,
  sourceId: string,
  action: "approved" | "rejected" | "delete",
  reason?: string | null,
  playerRows?: unknown,
) {
  const submissionId = submissionIdFromSourceId(sourceId);
  if (!submissionId) return false;
  if (action === "rejected" && !sanitizeEditableText(reason ?? "", 240)) {
    throw new AdminActionError("Rejection reason is required.", 400);
  }
  const playerRowsOverride = action === "approved" && playerRows !== undefined
    ? parseOwnerPlayerRows(playerRows)
    : null;
  if (action === "delete") {
    const { error } = await supabaseAdmin
      .from("mmm_submissions")
      .delete()
      .eq("id", submissionId)
      .eq("status", "pending");
    if (error) throw error;
    return true;
  }
  const submissionUpdate = await supabaseAdmin
    .from("mmm_submissions")
    .update({
      status: action,
      reviewed_by_user_id: authUserId,
      reviewed_at: new Date().toISOString(),
      review_note: action === "rejected" ? sanitizeEditableText(reason ?? "", 240) : sanitizeEditableText(reason ?? "", 240) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  let data = submissionUpdate.data;
  const error = submissionUpdate.error;
  if (error) throw error;
  if (data && playerRowsOverride) {
    const payload = data.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
      ? data.payload as Record<string, unknown>
      : {};
    const updated = await supabaseAdmin
      .from("mmm_submissions")
      .update({
        submitted_blocks_mined: playerRowsOverride.reduce((sum, row) => sum + row.blocksMined, 0),
        payload: {
          ...payload,
          playerRows: playerRowsOverride,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId)
      .select("*")
      .single();
    if (updated.error) throw updated.error;
    data = updated.data;
  }
  if (action === "approved" && data) {
    await materializeApprovedSubmission(data as SubmissionRow);
  }
  return true;
}

function parseOwnerPlayerRows(input: unknown) {
  const rawRows = Array.isArray(input) ? input : [];
  if (rawRows.length === 0 || rawRows.length > 50) {
    throw new AdminActionError("Add between 1 and 50 player rows.", 400);
  }
  const seen = new Set<string>();
  return rawRows.map((entry, index) => {
    const record = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
    const playerId = sanitizeEditableText(String(record.playerId ?? ""), 120) || null;
    const username = cleanPlayerDisplayName(String(record.username ?? ""));
    const blocksMined = Number(record.blocksMined ?? 0);
    if (!username) throw new AdminActionError(`Player ${index + 1} name is required.`, 400);
    if (!Number.isFinite(blocksMined) || blocksMined <= 0 || !Number.isInteger(blocksMined)) {
      throw new AdminActionError(`Player ${index + 1} blocks mined must be a positive whole number.`, 400);
    }
    const identityKeys = [`name:${normalizePlayerIdentity(username)}`, ...(playerId ? [`id:${playerId}`] : [])];
    if (identityKeys.some((key) => seen.has(key))) throw new AdminActionError(`Duplicate player "${username}".`, 400);
    identityKeys.forEach((key) => seen.add(key));
    return { playerId, username, blocksMined };
  });
}

async function createApprovedSubmissionSource(auth: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>, body: Record<string, unknown>) {
  const sourceName = sanitizeEditableText(String(body.sourceName ?? ""), 80);
  if (!sourceName) throw new AdminActionError("Source name is required.", 400);
  const sourceType = sanitizeEditableText(String(body.sourceType ?? "private-server"), 40).toLowerCase();
  const allowed = new Set(["private-server", "server", "singleplayer", "hardcore", "ssp", "hsp", "other"]);
  if (!allowed.has(sourceType)) throw new AdminActionError("Choose a valid source type.", 400);
  const playerRows = parseOwnerPlayerRows(body.playerRows);
  const totalBlocks = playerRows.reduce((sum, row) => sum + row.blocksMined, 0);
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("mmm_submissions")
    .insert({
      user_id: auth.userId,
      minecraft_uuid_hash: auth.viewer.minecraftUuidHash || `discord:${auth.userId}`,
      minecraft_username: sanitizeEditableText(auth.viewer.minecraftUsername, 32) || "Owner",
      submission_type: "add-new-source",
      target_source_id: null,
      target_source_slug: null,
      source_name: sourceName,
      source_type: sourceType,
      old_blocks_mined: null,
      submitted_blocks_mined: totalBlocks,
      proof_file_name: "owner-direct-add",
      proof_mime_type: "image/png",
      proof_size: 0,
      proof_image_ref: "",
      logo_url: sanitizeEditableText(String(body.logoUrl ?? ""), 240) || null,
      status: "approved",
      reviewed_by_user_id: auth.userId,
      reviewed_at: now,
      review_note: sanitizeEditableText(String(body.reason ?? ""), 240) || "Owner direct add",
      payload: {
        createdAt: now,
        directAdd: true,
        playerRows,
      },
    })
    .select("*")
    .single();
  if (error) throw error;
  if (data) {
    await materializeApprovedSubmission(data as SubmissionRow);
  }
}

async function backfillApprovedSourceEntries(input: {
  worldId: string;
  sourceId: string;
}) {
  const { data, error } = await supabaseAdmin.rpc("materialize_approved_world_source", {
    p_world_id: input.worldId,
    p_source_id: input.sourceId,
  });

  if (error) throw error;

  return ((data ?? []) as Array<{ affected_player_id?: string | null }>)
    .map((row) => String(row.affected_player_id ?? ""))
    .filter(Boolean);
}

export default async function handler(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return sourceApprovalResponse({ error: "Authentication required." }, { status: 401 });
    }

    if (!hasManagementRole(auth.viewer.role) && auth.viewer.isAdmin !== true) {
      return sourceApprovalResponse({ error: "Insufficient permissions." }, { status: 403 });
    }

    if (request.method === "GET") {
      return sourceApprovalResponse(await combinedApprovalResponse());
    }

    if (request.method !== "POST") {
      return sourceApprovalResponse({ error: "Method not allowed." }, { status: 405 });
    }

    if (!(await requireCsrf(request, auth))) {
      return sourceApprovalResponse({ error: "CSRF validation failed." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      sourceId?: string;
      action?: "approved" | "rejected" | "delete" | "create-direct-source";
      reason?: string | null;
      sourceName?: string;
      sourceType?: string;
      logoUrl?: string | null;
      playerRows?: Array<{ playerId?: string | null; username?: string; blocksMined?: number }>;
    } | null;

    if (body?.action === "create-direct-source") {
      await createApprovedSubmissionSource(auth, body as Record<string, unknown>);
      await refreshStaticManualOverridesSnapshot();
      invalidateDashboardSnapshotCache();
      return sourceApprovalResponse({
        ok: true,
        ...await combinedApprovalResponse(),
      });
    }

    if (!body?.sourceId) {
      return sourceApprovalResponse({ error: "Invalid payload." }, { status: 400 });
    }

    if (body.action === "approved" || body.action === "rejected" || body.action === "delete") {
      const handledSubmission = await updateSubmissionStatus(auth.userId, body.sourceId, body.action, body.reason ?? null, body.playerRows);
      if (handledSubmission) {
        await refreshStaticManualOverridesSnapshot();
        invalidateDashboardSnapshotCache();
        return sourceApprovalResponse({
          ok: true,
          ...await combinedApprovalResponse(),
        });
      }
    }

    // DELETE / action:"delete" — permanently wipe a source and reset the world to pending
    if (body.action === "delete") {
      const worldLookup = await supabaseAdmin
        .from("worlds_or_servers")
        .select("id,world_key,display_name,kind,host,approval_status,review_note")
        .eq("id", body.sourceId)
        .maybeSingle();

      if (worldLookup.error) throw worldLookup.error;
      if (!worldLookup.data) {
        return sourceApprovalResponse({ error: "Source not found." }, { status: 404 });
      }

      const sourceSlug = buildSourceSlug({
        displayName: worldLookup.data.display_name,
        worldKey: worldLookup.data.world_key,
        host: worldLookup.data.host,
      });

      // Find the sources row so we can collect affected player IDs before deletion
      const sourceLookup = await supabaseAdmin
        .from("sources")
        .select("id")
        .eq("slug", sourceSlug)
        .maybeSingle();
      if (sourceLookup.error) throw sourceLookup.error;

      const refreshedPlayerIds = new Set<string>();

      if (sourceLookup.data) {
        const sourceId = sourceLookup.data.id as string;

        // Collect players who had leaderboard entries for this source
        const linkedPlayers = await supabaseAdmin
          .from("leaderboard_entries")
          .select("player_id")
          .eq("source_id", sourceId);
        if (linkedPlayers.error) throw linkedPlayers.error;

        for (const row of linkedPlayers.data ?? []) {
          const playerId = String(row.player_id ?? "");
          if (playerId) refreshedPlayerIds.add(playerId);
        }

        // Delete all leaderboard entries for this source
        const deleteEntries = await supabaseAdmin
          .from("leaderboard_entries")
          .delete()
          .eq("source_id", sourceId);
        if (deleteEntries.error) throw deleteEntries.error;

        // Delete the source itself
        const deleteSource = await supabaseAdmin
          .from("sources")
          .delete()
          .eq("id", sourceId);
        if (deleteSource.error) throw deleteSource.error;
      }

      // Reset the world/server back to pending
      const resetWorld = await supabaseAdmin
        .from("worlds_or_servers")
        .update({
          approval_status: "pending",
          reviewed_by_user_id: null,
          reviewed_at: null,
          review_note: null,
        })
        .eq("id", body.sourceId);
      if (resetWorld.error) throw resetWorld.error;

      await applySourceModerationAudit(auth, {
        sourceId: body.sourceId,
        action: "delete",
        reason: body.reason ?? null,
        beforeState: {
          approvalStatus: worldLookup.data.approval_status,
          reviewNote: worldLookup.data.review_note,
          displayName: worldLookup.data.display_name,
        },
        afterState: {
          approvalStatus: "pending",
          deleted: true,
        },
      });

      // Refresh global leaderboard for all previously linked players
      for (const playerId of refreshedPlayerIds) {
        const refresh = await supabaseAdmin.rpc("refresh_player_global_leaderboard", { p_player_id: playerId });
        if (refresh.error) throw refresh.error;
      }

      await refreshStaticManualOverridesSnapshot();
      invalidateDashboardSnapshotCache();
      return sourceApprovalResponse({
        ok: true,
        ...await combinedApprovalResponse(),
      });
    }

    if (body.action !== "approved" && body.action !== "rejected") {
      return sourceApprovalResponse({ error: "Invalid approval payload." }, { status: 400 });
    }

    const worldLookup = await supabaseAdmin
      .from("worlds_or_servers")
      .select("id,world_key,display_name,kind,host,approval_status,review_note")
      .eq("id", body.sourceId)
      .maybeSingle();

    if (worldLookup.error) {
      throw worldLookup.error;
    }

    if (!worldLookup.data) {
      return sourceApprovalResponse({ error: "Source not found." }, { status: 404 });
    }

    const isSingleplayer = worldLookup.data.kind === "singleplayer";

    const { error } = await supabaseAdmin
      .from("worlds_or_servers")
      .update({
        approval_status: body.action,
        // Only set public_server scope for multiplayer; singleplayer keeps private_singleplayer
        source_scope: body.action === "approved" && !isSingleplayer ? "public_server" : undefined,
        reviewed_by_user_id: auth.userId,
        reviewed_at: new Date().toISOString(),
        review_note: body.action === "rejected" ? body.reason ?? null : null,
      })
      .eq("id", body.sourceId);

    if (error) {
      throw error;
    }

    const sourceSlug = buildSourceSlug({
      displayName: worldLookup.data.display_name,
      worldKey: worldLookup.data.world_key,
      host: worldLookup.data.host,
    });
    const sourceDisplayName = buildSourceDisplayName({
      displayName: worldLookup.data.display_name,
      worldKey: worldLookup.data.world_key,
      host: worldLookup.data.host,
    });
    const sourceType = buildSourceType(worldLookup.data.kind);
    const isApproved = body.action === "approved";
    // Singleplayer worlds are never public — their blocks count toward the main
    // leaderboard but they don't get a separate source tab.
    const isPublic = isApproved && !isSingleplayer;
    const approvedSource = isApproved
      ? await resolveSourceForApproval({
          sourceSlug,
          sourceDisplayName,
          sourceType,
          isPublic,
        })
      : await findExistingSourceForApproval(sourceSlug, sourceDisplayName);
    const sourceId = approvedSource?.id ?? null;
    const materializedSourceSlug = approvedSource?.slug ?? sourceSlug;
    const refreshedPlayerIds = new Set<string>();

    if (isApproved && sourceId) {
      const backfilledPlayers = await backfillApprovedSourceEntries({
        worldId: body.sourceId,
        sourceId,
      });
      for (const playerId of backfilledPlayers) {
        refreshedPlayerIds.add(playerId);
      }
    }

    if (!isApproved && sourceId) {
      const linkedPlayers = await supabaseAdmin
        .from("leaderboard_entries")
        .select("player_id")
        .eq("source_id", sourceId);
      if (linkedPlayers.error) throw linkedPlayers.error;

      for (const row of linkedPlayers.data ?? []) {
        const playerId = String(row.player_id ?? "");
        if (playerId) refreshedPlayerIds.add(playerId);
      }
    }

    const uniquePlayerIds = [...refreshedPlayerIds];
    for (const playerId of uniquePlayerIds) {
      const refresh = await supabaseAdmin.rpc("refresh_player_global_leaderboard", { p_player_id: playerId });
      if (refresh.error) {
        throw refresh.error;
      }
    }

    await setSourceReviewNote(body.sourceId, body.action === "rejected" ? body.reason ?? null : null);
    await applySourceModerationAudit(auth, {
      sourceId: body.sourceId,
      action: body.action,
      reason: body.reason ?? null,
      beforeState: {
        approvalStatus: worldLookup.data.approval_status,
        reviewNote: worldLookup.data.review_note,
        displayName: worldLookup.data.display_name,
      },
      afterState: {
        approvalStatus: body.action,
        reviewNote: body.action === "rejected" ? body.reason ?? null : null,
        isPublic,
        sourceId,
        sourceSlug: materializedSourceSlug,
      },
    });

    await refreshStaticManualOverridesSnapshot();
    invalidateDashboardSnapshotCache();
    return sourceApprovalResponse({
      ok: true,
      ...await combinedApprovalResponse(),
    });
  } catch (error) {
    if (error instanceof AdminActionError) {
      return sourceApprovalResponse({ error: error.message }, { status: error.status });
    }
    logServerError("admin-sources failed", error);
    return sourceApprovalResponse({ error: error instanceof Error ? error.message : "Unable to load source approvals." }, { status: 500 });
  }
}
