import { buildStaticPlayerDetailResponse } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToPlayerDetail } from "./_lib/static-mmm-overrides.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const payload = await applyStaticManualOverridesToPlayerDetail(buildStaticPlayerDetailResponse(new URL(request.url)));
  if (!payload) {
    return jsonResponse({ error: "Player not found." }, { status: 404 });
  }

  return jsonResponse(payload, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
    },
  });
}
