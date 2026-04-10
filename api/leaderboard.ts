import { buildLeaderboardResponse } from "./_lib/leaderboard.js";
import { jsonResponse, rateLimitRequest } from "./_lib/server.js";

export const config = { runtime: "nodejs" };

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "leaderboard", "public", 180, 5 * 60 * 1000);
  if (!allowed) {
    return jsonResponse({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(request.url);
  const response = await buildLeaderboardResponse({
    view: url.searchParams.get("view"),
    page: Number(url.searchParams.get("page") ?? "1"),
    pageSize: Number(url.searchParams.get("pageSize") ?? "100"),
    query: url.searchParams.get("query"),
    minBlocks: Number(url.searchParams.get("minBlocks") ?? "0"),
  });

  return jsonResponse(response, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
