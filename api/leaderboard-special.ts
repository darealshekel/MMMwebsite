import { readCachedPublicResponse, specialLeaderboardResponseCacheKey, writeCachedPublicResponse } from "./_lib/public-response-cache.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=60",
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const responseCacheKey = specialLeaderboardResponseCacheKey(url);
  const cached = await readCachedPublicResponse(responseCacheKey);
  if (cached) {
    return jsonResponse(cached, {
      headers: publicCacheHeaders,
    });
  }

  const [
    { buildStaticSpecialLeaderboardResponse },
    { applyStaticManualOverridesToLeaderboardResponse },
  ] = await Promise.all([
    import("./_lib/static-mmm-leaderboard.js"),
    import("./_lib/static-mmm-overrides.js"),
  ]);
  const payload = await applyStaticManualOverridesToLeaderboardResponse(buildStaticSpecialLeaderboardResponse(url), url);
  if (!payload) {
    return jsonResponse({ error: "Special leaderboard not found." }, { status: 404 });
  }

  await writeCachedPublicResponse(responseCacheKey, payload);
  return jsonResponse(payload, {
    headers: publicCacheHeaders,
  });
}
