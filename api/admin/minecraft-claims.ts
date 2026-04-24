import {
  approveMinecraftClaim,
  listMinecraftClaimsForAdmin,
  MinecraftClaimError,
  rejectMinecraftClaim,
  transferMinecraftClaim,
  unlinkMinecraftClaim,
} from "../_lib/minecraft-claims.js";
import { jsonResponse, logServerError, rateLimitRequest } from "../_lib/server.js";
import { getAuthContext, requireCsrf } from "../_lib/session.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return jsonResponse({ error: "Authentication required." }, { status: 401 });

    if (request.method === "GET") {
      const allowed = await rateLimitRequest(request, "admin-minecraft-claims", auth.userId, 120, 5 * 60 * 1000);
      if (!allowed) return jsonResponse({ error: "Too many requests." }, { status: 429 });

      const url = new URL(request.url);
      return jsonResponse(await listMinecraftClaimsForAdmin(auth, url.searchParams.get("status")));
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, { status: 405 });
    }

    if (!(await requireCsrf(request, auth))) {
      return jsonResponse({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as {
      action?: string;
      claimId?: string;
      reason?: string | null;
      targetUserId?: string;
    } | null;

    if (!body?.claimId || !body.action) {
      return jsonResponse({ error: "Claim id and action are required." }, { status: 400 });
    }

    if (body.action === "approve") return jsonResponse(await approveMinecraftClaim(auth, body.claimId));
    if (body.action === "reject") return jsonResponse(await rejectMinecraftClaim(auth, body.claimId, body.reason ?? null));
    if (body.action === "unlink") return jsonResponse(await unlinkMinecraftClaim(auth, body.claimId, body.reason ?? null));
    if (body.action === "transfer") return jsonResponse(await transferMinecraftClaim(auth, body.claimId, body.targetUserId ?? ""));

    return jsonResponse({ error: "Unsupported claim action." }, { status: 400 });
  } catch (error) {
    if (error instanceof MinecraftClaimError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    logServerError("admin minecraft claims failed", error);
    return jsonResponse({ error: "Unable to manage Minecraft claims." }, { status: 500 });
  }
}
