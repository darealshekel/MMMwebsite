import { mainLeaderboardResponseCacheKey, readCachedPublicResponse, writeCachedPublicResponse } from "./_lib/public-response-cache.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=60",
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const responseCacheKey = mainLeaderboardResponseCacheKey(url);
  const cached = await readCachedPublicResponse(responseCacheKey);
  if (cached) {
    return jsonResponse(cached, {
      headers: publicCacheHeaders,
    });
  }

  try {
    const [
      { buildStaticLeaderboardResponse },
      { applyStaticManualOverridesToLeaderboardResponse, buildApprovedSubmissionSourceLeaderboardResponse },
    ] = await Promise.all([
      import("./_lib/static-mmm-leaderboard.js"),
      import("./_lib/static-mmm-overrides.js"),
    ]);
    const response = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(url), url)
      ?? await buildApprovedSubmissionSourceLeaderboardResponse(url);
    if (!response) {
      return jsonResponse({ error: "Leaderboard not found." }, { status: 404 });
    }

    await writeCachedPublicResponse(responseCacheKey, response);
    return jsonResponse(response, {
      headers: publicCacheHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonResponse({ error: "Leaderboard not found." }, { status: 404 });
    }

    throw error;
  }
}
