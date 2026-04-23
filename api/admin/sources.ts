import type { SourceApprovalSummary } from "../../src/lib/types.js";
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
      const data = await loadSourceApprovalData();
      return sourceApprovalResponse({
        sources: toSummary(buildSourceRollups(data.worlds, data.worldStats, data.aeternumAggregates, { preferAeternumForAdmin: true }), data.players),
        minimumBlocks: 0,
      });
    }

    if (request.method !== "POST") {
      return sourceApprovalResponse({ error: "Method not allowed." }, { status: 405 });
    }

    if (!(await requireCsrf(request, auth))) {
      return sourceApprovalResponse({ error: "CSRF validation failed." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      sourceId?: string;
      action?: "approved" | "rejected" | "delete";
      reason?: string | null;
    } | null;

    if (!body?.sourceId) {
      return sourceApprovalResponse({ error: "Invalid payload." }, { status: 400 });
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

      const data = await loadSourceApprovalData();
      return sourceApprovalResponse({
        ok: true,
        sources: toSummary(buildSourceRollups(data.worlds, data.worldStats, data.aeternumAggregates, { preferAeternumForAdmin: true }), data.players),
        minimumBlocks: 0,
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

    const data = await loadSourceApprovalData();
    return sourceApprovalResponse({
      ok: true,
      sources: toSummary(buildSourceRollups(data.worlds, data.worldStats, data.aeternumAggregates, { preferAeternumForAdmin: true }), data.players),
      minimumBlocks: 0,
    });
  } catch (error) {
    if (error instanceof AdminActionError) {
      return sourceApprovalResponse({ error: error.message }, { status: error.status });
    }
    logServerError("admin-sources failed", error);
    return sourceApprovalResponse({ error: error instanceof Error ? error.message : "Unable to load source approvals." }, { status: 500 });
  }
}
