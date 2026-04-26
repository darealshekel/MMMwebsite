import { mainLeaderboardResponseCacheKey, readCachedPublicResponse, writeCachedPublicResponse } from "./_lib/public-response-cache.js";
import { jsonResponse } from "./_lib/http.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=60",
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const responseCacheKey = mainLeaderboardResponseCacheKey(url);
  if (url.searchParams.get("refreshCache") !== "1") {
    const cached = await readCachedPublicResponse(responseCacheKey);
    if (cached) {
      return jsonResponse(cached, {
        headers: publicCacheHeaders,
      });
    }
  }

  try {
    const [
      { buildStaticLeaderboardResponse },
      { applyStaticManualOverridesToLeaderboardResponse, buildApprovedSubmissionSourceLeaderboardResponse },
    ] = await Promise.all([
      import("./_lib/static-mmm-leaderboard.js"),
      import("./_lib/static-mmm-overrides.js"),
    ]);
    const sourceSlug = url.searchParams.get("source");
    const response = sourceSlug
      ? await buildApprovedSubmissionSourceLeaderboardResponse(url)
        ?? await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(url), url)
      : await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(url), url)
        ?? await buildApprovedSubmissionSourceLeaderboardResponse(url);
    if (!response) {
      return jsonResponse({ error: "Leaderboard not found." }, { status: 404 });
    }

    const shouldIncludeSources = url.searchParams.get("includeSources") === "1" || Boolean(url.searchParams.get("source"));
    const responseBody = shouldIncludeSources ? response : { ...response, publicSources: [] };
    await writeCachedPublicResponse(responseCacheKey, responseBody);
    return jsonResponse(responseBody, {
      headers: publicCacheHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonResponse({ error: "Leaderboard not found." }, { status: 404 });
    }

    throw error;
  }
}
