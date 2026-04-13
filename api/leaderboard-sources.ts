import { getPublicSources } from "./_lib/leaderboard.js";
import { jsonResponse, rateLimitRequest } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "leaderboard-sources", "public", 180, 5 * 60 * 1000);
  if (!allowed) {
    return jsonResponse({ error: "Too many requests." }, { status: 429 });
  }

  const sources = await getPublicSources();
  return jsonResponse(
    { sources },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
