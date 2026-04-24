import { listMyMinecraftClaims, MinecraftClaimError } from "../_lib/minecraft-claims.js";
import { jsonResponse, logServerError, rateLimitRequest } from "../_lib/server.js";
import { getAuthContext } from "../_lib/session.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  try {
    const allowed = await rateLimitRequest(request, "minecraft-claims", "me", 120, 5 * 60 * 1000);
    if (!allowed) return jsonResponse({ error: "Too many requests." }, { status: 429 });

    const auth = await getAuthContext(request);
    if (!auth) return jsonResponse({ error: "Authentication required." }, { status: 401 });

    return jsonResponse(await listMyMinecraftClaims(auth));
  } catch (error) {
    if (error instanceof MinecraftClaimError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    logServerError("minecraft claims me failed", error);
    return jsonResponse({ error: "Unable to load Minecraft claims." }, { status: 500 });
  }
}
