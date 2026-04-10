import type { SourceApprovalSummary } from "../../src/lib/types.js";
import { hasManagementRole, getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, rateLimitRequest, supabaseAdmin } from "../_lib/server.js";
import { buildSourceRollups, loadSourceApprovalData } from "../_lib/source-approval.js";

export const config = { runtime: "edge" };

function toSummary(
  sources: ReturnType<typeof buildSourceRollups>,
  players: Array<{ id: string; username: string }>,
): SourceApprovalSummary[] {
  const playerById = new Map(players.map((player) => [player.id, player.username]));

  return sources
    .filter((source) => source.sourceScope === "public_server")
    .map((source) => ({
      id: source.id,
      displayName: source.displayName,
      worldKey: source.worldKey,
      kind: source.kind,
      sourceScope: source.sourceScope,
      totalBlocks: source.totalBlocks,
      playerCount: source.playerCount,
      submittedByUsername: source.submittedByPlayerId ? playerById.get(source.submittedByPlayerId) ?? null : null,
      submittedAt: source.submittedAt,
      firstSeenAt: source.firstSeenAt,
      lastSeenAt: source.lastSeenAt,
      approvalStatus: source.approvalStatus,
      eligibleForPublic: source.approvalStatus === "approved",
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

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "admin-sources", "viewer", 60, 5 * 60 * 1000);
  if (!allowed) {
    return jsonResponse({ error: "Too many requests." }, { status: 429 });
  }

  const auth = await getAuthContext(request);
  if (!auth) {
    return jsonResponse({ error: "Authentication required." }, { status: 401 });
  }

  if (!hasManagementRole(auth.viewer.role) && auth.viewer.isAdmin !== true) {
    return jsonResponse({ error: "Insufficient permissions." }, { status: 403 });
  }

  if (request.method === "GET") {
    const data = await loadSourceApprovalData();
    return jsonResponse({
      sources: toSummary(buildSourceRollups(data.worlds, data.worldStats), data.players),
      minimumBlocks: 0,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  if (!(await requireCsrf(request, auth))) {
    return jsonResponse({ error: "CSRF validation failed." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { sourceId?: string; action?: "approved" | "rejected" } | null;
  if (!body?.sourceId || (body.action !== "approved" && body.action !== "rejected")) {
    return jsonResponse({ error: "Invalid approval payload." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("worlds_or_servers")
    .update({
      approval_status: body.action,
      reviewed_by_user_id: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", body.sourceId);

  if (error) {
    throw error;
  }

  const data = await loadSourceApprovalData();
  return jsonResponse({
    ok: true,
    sources: toSummary(buildSourceRollups(data.worlds, data.worldStats), data.players),
    minimumBlocks: 0,
  });
}
