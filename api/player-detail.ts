import { buildStaticPlayerDetailResponse } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToPlayerDetail, buildApprovedSubmissionPlayerDetailResponse } from "./_lib/static-mmm-overrides.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const payload = await applyStaticManualOverridesToPlayerDetail(buildStaticPlayerDetailResponse(url))
    ?? await buildApprovedSubmissionPlayerDetailResponse(url);
  if (!payload) {
    return jsonResponse({ error: "Player not found." }, { status: 404 });
  }

  return jsonResponse(payload, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=10",
    },
  });
}
