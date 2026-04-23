import { buildStaticLeaderboardResponse } from "./_lib/static-mmm-leaderboard.js";
import { jsonResponse, rateLimitRequest } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "leaderboard", "public", 900, 5 * 60 * 1000);
  if (!allowed) {
    return jsonResponse({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(request.url);
  try {
    const response = buildStaticLeaderboardResponse(url);
    if (!response) {
      return jsonResponse({ error: "Leaderboard not found." }, { status: 404 });
    }

    return jsonResponse(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonResponse({ error: "Leaderboard not found." }, { status: 404 });
    }

    throw error;
  }
}
