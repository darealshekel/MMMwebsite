import { buildStaticSpecialLeaderboardResponse } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToLeaderboardResponse } from "./_lib/static-mmm-overrides.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const payload = await applyStaticManualOverridesToLeaderboardResponse(buildStaticSpecialLeaderboardResponse(new URL(request.url)));
  if (!payload) {
    return jsonResponse({ error: "Special leaderboard not found." }, { status: 404 });
  }

  return jsonResponse(payload, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
    },
  });
}
