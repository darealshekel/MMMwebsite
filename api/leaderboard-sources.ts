import { publicSourcesResponseCacheKey, readCachedPublicResponse, writeCachedPublicResponse } from "./_lib/public-response-cache.js";
import { getStaticPublicSources } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToSources } from "./_lib/static-mmm-overrides.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

const OVERRIDE_TIMEOUT_MS = 800;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const cacheKey = publicSourcesResponseCacheKey();
  const staticSources = getStaticPublicSources();

  if (url.searchParams.get("refreshCache") !== "1") {
    const cached = await readCachedPublicResponse(cacheKey);
    if (cached) {
      return jsonResponse(cached, { headers: publicCacheHeaders });
    }
  }

  const enriched = await withTimeout(
    applyStaticManualOverridesToSources(staticSources),
    OVERRIDE_TIMEOUT_MS,
  );

  const sources = enriched ?? staticSources;

  if (enriched) {
    void writeCachedPublicResponse(cacheKey, enriched);
  }

  return jsonResponse(sources, { headers: publicCacheHeaders });
}
