import { buildStaticSpecialLeaderboardResponse } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToLeaderboardResponse } from "./_lib/static-mmm-overrides.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const payload = await applyStaticManualOverridesToLeaderboardResponse(buildStaticSpecialLeaderboardResponse(url), url);
  if (!payload) {
    return jsonResponse({ error: "Special leaderboard not found." }, { status: 404 });
  }

  return jsonResponse(payload, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=60",
    },
  });
}
