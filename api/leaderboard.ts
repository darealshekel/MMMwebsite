import { isPaginatedPublicPayloadForRequest, mainLeaderboardResponseCacheKey, readCachedPublicResponse, writeCachedPublicResponse } from "./_lib/public-response-cache.js";
import { jsonResponse } from "./_lib/http.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=600",
};

const SOURCE_OVERRIDE_TIMEOUT_MS = 2_500;
const FORCE_REFRESH_OVERRIDE_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function requestedPage(url: URL) {
  return Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1);
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const responseCacheKey = mainLeaderboardResponseCacheKey(url);
  const isRefresh = url.searchParams.get("refreshCache") === "1";

  if (!isRefresh) {
    const cached = await readCachedPublicResponse(responseCacheKey, (payload) => isPaginatedPublicPayloadForRequest(payload, url));
    if (cached) {
      return jsonResponse(cached, { headers: publicCacheHeaders });
    }
  }

  const [
    { buildStaticLeaderboardResponse },
    { applyStaticManualOverridesToLeaderboardResponse, buildApprovedSubmissionSourceLeaderboardResponse },
  ] = await Promise.all([
    import("./_lib/static-mmm-leaderboard.js"),
    import("./_lib/static-mmm-overrides.js"),
  ]);

  const sourceSlug = url.searchParams.get("source");
  const staticResponse = buildStaticLeaderboardResponse(url);

  const buildEnriched = sourceSlug
    ? buildApprovedSubmissionSourceLeaderboardResponse(url)
        .then((r) => r ?? applyStaticManualOverridesToLeaderboardResponse(staticResponse, url))
    : applyStaticManualOverridesToLeaderboardResponse(staticResponse, url)
        .then((r) => r ?? buildApprovedSubmissionSourceLeaderboardResponse(url));

  const staticTotalPages = Number(staticResponse?.totalPages ?? 1);
  const needsEnrichedMainTailPage = !sourceSlug && requestedPage(url) > staticTotalPages;
  const overrideTimeoutMs = isRefresh
    ? FORCE_REFRESH_OVERRIDE_TIMEOUT_MS
    : SOURCE_OVERRIDE_TIMEOUT_MS;
  const enriched = needsEnrichedMainTailPage || !sourceSlug
    ? await buildEnriched
    : await withTimeout(buildEnriched, overrideTimeoutMs);

  const response = enriched ?? staticResponse;

  if (!response) {
    return jsonResponse({ error: "Leaderboard not found." }, { status: 404 });
  }

  const shouldIncludeSources = url.searchParams.get("includeSources") === "1" || Boolean(sourceSlug);
  const responseBody = shouldIncludeSources ? response : { ...response, publicSources: [] };

  if (enriched) {
    void writeCachedPublicResponse(responseCacheKey, responseBody);
  }

  return jsonResponse(responseBody, { headers: publicCacheHeaders });
}
