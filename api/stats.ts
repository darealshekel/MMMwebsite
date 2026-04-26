import { buildCachedDashboardSnapshot } from "./_lib/dashboard.js";
import { jsonResponse, rateLimitRequest } from "./_lib/server.js";
import { getAuthContext } from "./_lib/session.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "stats", "summary", 120, 5 * 60 * 1000);
  if (!allowed) return jsonResponse({ error: "Too many requests." }, { status: 429 });

  const auth = await getAuthContext(request);
  if (!auth) return jsonResponse({ error: "Authentication required." }, { status: 401 });

  const snapshot = await buildCachedDashboardSnapshot(auth);
  return jsonResponse({
    player: snapshot.player,
    dailyGoal: snapshot.dailyGoal,
    estimatedBlocksPerHour: snapshot.estimatedBlocksPerHour,
    estimatedFinishSeconds: snapshot.estimatedFinishSeconds,
    lastSyncedAt: snapshot.lastSyncedAt,
  });
}
