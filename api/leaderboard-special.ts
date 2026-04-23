import { buildStaticSpecialLeaderboardResponse } from "./_lib/static-mmm-leaderboard.js";
import { jsonResponse, rateLimitRequest } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "leaderboard-special", "public", 300, 5 * 60 * 1000);
  if (!allowed) {
    return jsonResponse({ error: "Too many requests." }, { status: 429 });
  }

  const payload = buildStaticSpecialLeaderboardResponse(new URL(request.url));
  if (!payload) {
    return jsonResponse({ error: "Special leaderboard not found." }, { status: 404 });
  }

  return jsonResponse(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
