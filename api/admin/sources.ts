import type { SourceApprovalSummary } from "../../src/lib/types.js";
import { sanitizeEditableText } from "../../shared/admin-management.js";
import { buildSourceDisplayName, buildSourceSlug, buildSourceType } from "../../shared/source-slug.js";
import { applySourceModerationAudit, setSourceReviewNote, AdminActionError } from "../_lib/admin-management.js";
import { submitSourceScore } from "../_lib/leaderboard.js";
import { hasManagementRole, getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError, supabaseAdmin } from "../_lib/server.js";
import { buildSourceRollups, loadSourceApprovalData } from "../_lib/source-approval.js";

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
  const rows = rawRows.flatMap((entry): Array<{ username: string; blocksMined: number }> => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const username = sanitizeEditableText(String(record.username ?? ""), 32);
    const blocksMined = Number(record.blocksMined ?? 0);
    return username && Number.isFinite(blocksMined) && blocksMined > 0
      ? [{ username, blocksMined: Math.floor(blocksMined) }]
      : [];
  });
  return rows.length > 0
    ? rows
    : [{ username: row.minecraft_username, blocksMined: Number(row.submitted_blocks_mined ?? 0) }];
}

function submissionToSummary(row: SubmissionRow): SourceApprovalSummary {
  const playerRows = submissionPlayerRows(row);
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

async function loadSubmissionApprovals() {
  const { data, error } = await supabaseAdmin
    .from("mmm_submissions")
    .select("*")
    .in("status", ["pending", "approved", "rejected"])
    .order("created_at", { ascending: false })
    .limit(160);
  if (error) {
    if (isMissingSupabaseTableError(error)) return [];
    throw error;
  }
  return ((data ?? []) as SubmissionRow[]).map(submissionToSummary);
}

async function loadWorldApprovals() {
  try {
    const data = await loadSourceApprovalData();
    return toSummary(buildSourceRollups(data.worlds, data.worldStats, data.aeternumAggregates, { preferAeternumForAdmin: true }), data.players)
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
    sources: [...submittedSources, ...worldSources],
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

async function resolveSubmissionPlayerId(submission: SubmissionRow, username: string, now: string) {
  const cleanUsername = sanitizeEditableText(username, 32);
  if (!cleanUsername) return null;
  const usernameLower = cleanUsername.toLowerCase();
  const submissionOwner = cleanUsername.toLowerCase() === sanitizeEditableText(submission.minecraft_username, 32).toLowerCase();

  if (submissionOwner && submission.minecraft_uuid_hash) {
    const byUuid = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("minecraft_uuid_hash", submission.minecraft_uuid_hash)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byUuid.error) throw byUuid.error;
    if (byUuid.data?.id) return String(byUuid.data.id);
  }

  const byUsername = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("username_lower", usernameLower)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byUsername.error) throw byUsername.error;
  if (byUsername.data?.id) return String(byUsername.data.id);

  const inserted = await supabaseAdmin
    .from("players")
    .insert({
      client_id: `mmm-submission:${submission.id}:${usernameLower}`,
      username: cleanUsername,
      minecraft_uuid_hash: submissionOwner ? submission.minecraft_uuid_hash : null,
      last_seen_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
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
  const rows = submission.submission_type === "edit-existing-source"
    ? [{ username: submission.minecraft_username, blocksMined: Number(submission.submitted_blocks_mined ?? 0) }]
    : submissionPlayerRows(submission);
  const materializedPlayerIds: string[] = [];

  for (const row of rows) {
    const playerId = await resolveSubmissionPlayerId(submission, row.username, now);
    if (!playerId) continue;
    materializedPlayerIds.push(playerId);
    await submitSourceScore({
      playerId,
      sourceSlug,
      sourceDisplayName: sourceName,
      sourceType: submission.source_type || "server",
      score: row.blocksMined,
      isPublic,
    });
  }

  const approvedSource = await supabaseAdmin
    .from("sources")
    .update({
      is_approved: true,
      is_public: isPublic,
      updated_at: now,
    })
    .eq("slug", sourceSlug);
  if (approvedSource.error) throw approvedSource.error;

  for (const playerId of [...new Set(materializedPlayerIds)]) {
    const refresh = await supabaseAdmin.rpc("refresh_player_global_leaderboard", { p_player_id: playerId });
    if (refresh.error) throw refresh.error;
  }
}

async function updateSubmissionStatus(authUserId: string, sourceId: string, action: "approved" | "rejected" | "delete", reason?: string | null) {
  const submissionId = submissionIdFromSourceId(sourceId);
  if (!submissionId) return false;
  if (action === "rejected" && !sanitizeEditableText(reason ?? "", 240)) {
    throw new AdminActionError("Rejection reason is required.", 400);
  }
  if (action === "delete") {
    const { error } = await supabaseAdmin
      .from("mmm_submissions")
      .delete()
      .eq("id", submissionId)
      .eq("status", "pending");
    if (error) throw error;
    return true;
  }
  const { data, error } = await supabaseAdmin
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
  if (error) throw error;
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
    const username = sanitizeEditableText(String(record.username ?? ""), 32);
    const blocksMined = Number(record.blocksMined ?? 0);
    if (!username) throw new AdminActionError(`Player ${index + 1} name is required.`, 400);
    if (!Number.isFinite(blocksMined) || blocksMined <= 0 || !Number.isInteger(blocksMined)) {
      throw new AdminActionError(`Player ${index + 1} blocks mined must be a positive whole number.`, 400);
    }
    const key = username.toLowerCase();
    if (seen.has(key)) throw new AdminActionError(`Duplicate player "${username}".`, 400);
    seen.add(key);
    return { username, blocksMined };
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
  sourceSlug: string;
  sourceDisplayName: string;
  sourceType: string;
  isPublic: boolean;
}) {
  const [worldStats, aeternumStats] = await Promise.all([
    supabaseAdmin
      .from("player_world_stats")
      .select("player_id,total_blocks")
      .eq("world_id", input.worldId)
      .gt("total_blocks", 0),
    supabaseAdmin
      .from("aeternum_player_stats")
      .select("player_id,username,player_digs")
      .eq("source_world_id", input.worldId)
      .eq("is_fake_player", false)
      .gt("player_digs", 0),
  ]);

  if (worldStats.error) throw worldStats.error;
  if (aeternumStats.error) throw aeternumStats.error;

  // For aeternum rows without a player_id, attempt to resolve via username lookup
  const anonymousUsernameLowers = [
    ...new Set(
      (aeternumStats.data ?? [])
        .filter((row) => !row.player_id && row.username)
        .map((row) => (row.username as string).trim().toLowerCase()),
    ),
  ];

  const playerIdByUsernameLower = new Map<string, string>();
  if (anonymousUsernameLowers.length > 0) {
    const { data: playerRows, error: playerLookupError } = await supabaseAdmin
      .from("players")
      .select("id,username_lower")
      .in("username_lower", anonymousUsernameLowers);
    if (playerLookupError) throw playerLookupError;
    for (const row of playerRows ?? []) {
      if (row.id && row.username_lower) {
        playerIdByUsernameLower.set(row.username_lower as string, row.id as string);
      }
    }
  }

  const bestByPlayerId = new Map<string, number>();
  for (const row of worldStats.data ?? []) {
    const playerId = String(row.player_id ?? "");
    if (!playerId) continue;
    const score = Number(row.total_blocks ?? 0);
    if (!Number.isFinite(score) || score <= 0) continue;
    const current = bestByPlayerId.get(playerId) ?? 0;
    if (score > current) bestByPlayerId.set(playerId, Math.floor(score));
  }

  for (const row of aeternumStats.data ?? []) {
    let playerId = String(row.player_id ?? "");
    if (!playerId) {
      const usernameLower = (row.username as string ?? "").trim().toLowerCase();
      const resolvedId = playerIdByUsernameLower.get(usernameLower);
      if (!resolvedId) continue;
      playerId = resolvedId;
    }
    const score = Number(row.player_digs ?? 0);
    if (!Number.isFinite(score) || score <= 0) continue;
    const current = bestByPlayerId.get(playerId) ?? 0;
    if (score > current) bestByPlayerId.set(playerId, Math.floor(score));
  }

  const updatedPlayerIds: string[] = [];
  for (const [playerId, score] of bestByPlayerId.entries()) {
    await submitSourceScore({
      playerId,
      sourceSlug: input.sourceSlug,
      sourceDisplayName: input.sourceDisplayName,
      sourceType: input.sourceType,
      score,
      isPublic: input.isPublic,
    });
    updatedPlayerIds.push(playerId);
  }

  return updatedPlayerIds;
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
      playerRows?: Array<{ username?: string; blocksMined?: number }>;
    } | null;

    if (body?.action === "create-direct-source") {
      await createApprovedSubmissionSource(auth, body as Record<string, unknown>);
      return sourceApprovalResponse({
        ok: true,
        ...await combinedApprovalResponse(),
      });
    }

    if (!body?.sourceId) {
      return sourceApprovalResponse({ error: "Invalid payload." }, { status: 400 });
    }

    if (body.action === "approved" || body.action === "rejected" || body.action === "delete") {
      const handledSubmission = await updateSubmissionStatus(auth.userId, body.sourceId, body.action, body.reason ?? null);
      if (handledSubmission) {
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

    const sourceUpsert = await supabaseAdmin
      .from("sources")
      .upsert({
        slug: sourceSlug,
        display_name: sourceDisplayName,
        source_type: sourceType,
        is_public: isPublic,
        is_approved: isApproved,
        updated_at: new Date().toISOString(),
      }, { onConflict: "slug" })
      .select("id")
      .single();

    if (sourceUpsert.error) {
      throw sourceUpsert.error;
    }

    const sourceId = sourceUpsert.data.id as string;
    const refreshedPlayerIds = new Set<string>();

    if (isApproved) {
      const backfilledPlayers = await backfillApprovedSourceEntries({
        worldId: body.sourceId,
        sourceSlug,
        sourceDisplayName,
        sourceType,
        isPublic,
      });
      for (const playerId of backfilledPlayers) {
        refreshedPlayerIds.add(playerId);
      }
    }

    const linkedPlayers = await supabaseAdmin
      .from("leaderboard_entries")
      .select("player_id")
      .eq("source_id", sourceId);
    if (linkedPlayers.error) throw linkedPlayers.error;

    for (const row of linkedPlayers.data ?? []) {
      const playerId = String(row.player_id ?? "");
      if (playerId) refreshedPlayerIds.add(playerId);
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
      },
    });

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
