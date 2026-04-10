import { buildLeaderboardResponse } from "./_lib/leaderboard.js";
import { jsonResponse, rateLimitRequest } from "./_lib/server.js";

export const config = { runtime: "nodejs" };

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseNonNegativeInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "leaderboard", "public", 180, 5 * 60 * 1000);
  if (!allowed) {
    return jsonResponse({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(request.url, "http://localhost");
  const rawView = url.searchParams.get("view");
  const view = rawView?.trim() || null;

  const response = await buildLeaderboardResponse({
    view,
    page: parsePositiveInt(url.searchParams.get("page"), 1),
    pageSize: parsePositiveInt(url.searchParams.get("pageSize"), 100),
    query: url.searchParams.get("query")?.trim() || null,
    minBlocks: parseNonNegativeInt(url.searchParams.get("minBlocks"), 0),
  });

  return jsonResponse(response, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
