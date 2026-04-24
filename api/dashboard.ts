import { buildDashboardSnapshot } from "./_lib/dashboard.js";
import { jsonResponse, rateLimitRequest } from "./_lib/server.js";
import { getAuthContext } from "./_lib/session.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "dashboard", "snapshot", 120, 5 * 60 * 1000);
  if (!allowed) {
    return jsonResponse({ error: "Too many requests." }, { status: 429 });
  }

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

  return jsonResponse(await buildDashboardSnapshot(auth));
}
