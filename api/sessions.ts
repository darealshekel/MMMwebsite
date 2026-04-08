import { buildDashboardSnapshot } from "./_lib/dashboard";
import { jsonResponse, rateLimitRequest } from "./_lib/server";
import { getAuthContext } from "./_lib/session";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "sessions", "list", 120, 5 * 60 * 1000);
  if (!allowed) return jsonResponse({ error: "Too many requests." }, { status: 429 });

  const auth = await getAuthContext(request);
  if (!auth) return jsonResponse({ error: "Authentication required." }, { status: 401 });

  const snapshot = await buildDashboardSnapshot(auth);
  return jsonResponse({ sessions: snapshot.sessions });
}
