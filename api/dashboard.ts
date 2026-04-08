import { buildDashboardSnapshot } from "./_lib/dashboard";
import { jsonResponse, rateLimitRequest } from "./_lib/server";
import { getAuthContext } from "./_lib/session";

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
        description: "Link your Minecraft account with Microsoft to open your personal AeTweaks dashboard.",
      },
    }, { status: 401 });
  }

  return jsonResponse(await buildDashboardSnapshot(auth));
}
