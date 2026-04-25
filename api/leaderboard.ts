import { buildStaticLeaderboardResponse } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToLeaderboardResponse, buildApprovedSubmissionSourceLeaderboardResponse } from "./_lib/static-mmm-overrides.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const url = new URL(request.url);
  try {
    const response = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(url), url)
      ?? await buildApprovedSubmissionSourceLeaderboardResponse(url);
    if (!response) {
      return jsonResponse({ error: "Leaderboard not found." }, { status: 404 });
    }

    return jsonResponse(response, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonResponse({ error: "Leaderboard not found." }, { status: 404 });
    }

    throw error;
  }
}
