import { MinecraftClaimError, submitMinecraftClaim } from "../_lib/minecraft-claims.js";
import { jsonResponse, logServerError, rateLimitRequest } from "../_lib/server.js";
import { getAuthContext, requireCsrf } from "../_lib/session.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const auth = await getAuthContext(request);
    if (!auth) return jsonResponse({ error: "Authentication required." }, { status: 401 });
    if (!(await requireCsrf(request, auth))) {
      return jsonResponse({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const allowed = await rateLimitRequest(request, "minecraft-claims-submit", auth.userId, 5, 10 * 60 * 1000);
    if (!allowed) return jsonResponse({ error: "Too many claim submissions. Try again later." }, { status: 429 });

    const body = await request.json().catch(() => null) as { submittedValue?: string } | null;
    return jsonResponse(await submitMinecraftClaim(auth, { submittedValue: body?.submittedValue ?? "" }));
  } catch (error) {
    if (error instanceof MinecraftClaimError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    logServerError("minecraft claim submit failed", error);
    return jsonResponse({ error: "Unable to submit Minecraft claim." }, { status: 500 });
  }
}
