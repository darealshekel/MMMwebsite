import { readCachedPublicResponse, specialLeaderboardResponseCacheKey, writeCachedPublicResponse } from "./_lib/public-response-cache.js";
import { jsonResponse } from "./_lib/http.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const responseCacheKey = specialLeaderboardResponseCacheKey(url);
  if (url.searchParams.get("refreshCache") !== "1") {
    const cached = await readCachedPublicResponse(responseCacheKey);
    if (cached) {
      return jsonResponse(cached, {
        headers: publicCacheHeaders,
      });
    }
  }

  const { buildStaticSpecialLeaderboardResponse } = await import("./_lib/static-mmm-leaderboard.js");
  const payload = buildStaticSpecialLeaderboardResponse(url);
  if (!payload) {
    return jsonResponse({ error: "Special leaderboard not found." }, { status: 404 });
  }

  await writeCachedPublicResponse(responseCacheKey, payload);
  return jsonResponse(payload, {
    headers: publicCacheHeaders,
  });
}
