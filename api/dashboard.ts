import { buildCachedDashboardSnapshot } from "./_lib/dashboard.js";
import { jsonResponse, rateLimitRequest } from "./_lib/server.js";
import { getAuthContext } from "./_lib/session.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return jsonResponse({
      error: "Authentication required.",
      meta: {
        source: "auth_required",
        title: "Sign in required",
        description: "Log in with Discord and link your Minecraft account to open your personal MMM dashboard.",
      },
    }, { status: 401 });
  }

  const allowed = await rateLimitRequest(request, "dashboard", "snapshot", 120, 5 * 60 * 1000);
  if (!allowed) {
    return jsonResponse({ error: "Too many requests." }, { status: 429 });
  }

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  return jsonResponse(await buildCachedDashboardSnapshot(auth, { forceRefresh }));
}
