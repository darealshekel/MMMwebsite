import { isPaginatedPublicPayloadForRequest, readCachedPublicResponse, specialLeaderboardResponseCacheKey, writeCachedPublicResponse } from "./_lib/public-response-cache.js";
import { jsonResponse } from "./_lib/http.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

const SPECIAL_OVERRIDE_TIMEOUT_MS = 2_500;
const FORCE_REFRESH_OVERRIDE_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const responseCacheKey = specialLeaderboardResponseCacheKey(url);
  const isRefresh = url.searchParams.get("refreshCache") === "1";
  if (!isRefresh) {
    const cached = await readCachedPublicResponse(responseCacheKey, (payload) => isPaginatedPublicPayloadForRequest(payload, url));
    if (cached) {
      return jsonResponse(cached, {
        headers: publicCacheHeaders,
      });
    }
  }

  const [
    { buildStaticSpecialLeaderboardResponse },
    { applyStaticManualOverridesToLeaderboardResponse },
  ] = await Promise.all([
    import("./_lib/static-mmm-leaderboard.js"),
    import("./_lib/static-mmm-overrides.js"),
  ]);
  const staticPayload = buildStaticSpecialLeaderboardResponse(url);
  const enrichedPayload = await withTimeout(
    applyStaticManualOverridesToLeaderboardResponse(staticPayload, url),
    isRefresh ? FORCE_REFRESH_OVERRIDE_TIMEOUT_MS : SPECIAL_OVERRIDE_TIMEOUT_MS,
  );
  const payload = enrichedPayload ?? staticPayload;
  if (!payload) {
    return jsonResponse({ error: "Special leaderboard not found." }, { status: 404 });
  }

  if (enrichedPayload) {
    await writeCachedPublicResponse(responseCacheKey, payload);
  }
  return jsonResponse(payload, {
    headers: publicCacheHeaders,
  });
}
