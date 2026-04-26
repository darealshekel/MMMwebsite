import { publicSourcesResponseCacheKey, readCachedPublicResponse, writeCachedPublicResponse } from "./_lib/public-response-cache.js";
import { getStaticPublicSources } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToSources } from "./_lib/static-mmm-overrides.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
};
const cacheReadTimeoutMs = 650;
const sourceBuildTimeoutMs = 1_800;

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function readSourcesCache(cacheKey: string) {
  try {
    return await withTimeout(readCachedPublicResponse(cacheKey), cacheReadTimeoutMs, "source cache read timed out");
  } catch (error) {
    console.error("[leaderboard-sources] cache read failed", {
      error: describeError(error),
    });
    return null;
  }
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const cacheKey = publicSourcesResponseCacheKey();
  const staticSources = getStaticPublicSources();

  if (url.searchParams.get("refreshCache") !== "1") {
    const cached = await readSourcesCache(cacheKey);
    if (cached) {
      return jsonResponse(cached, {
        headers: publicCacheHeaders,
      });
    }
  }

  try {
    const sources = await withTimeout(
      applyStaticManualOverridesToSources(staticSources),
      sourceBuildTimeoutMs,
      "source override build timed out",
    );
    await writeCachedPublicResponse(cacheKey, sources);
    return jsonResponse(sources, {
      headers: publicCacheHeaders,
    });
  } catch (error) {
    console.error("[leaderboard-sources] override build failed; returning static snapshot", {
      error: describeError(error),
      staticSourceCount: staticSources.length,
    });

    const cached = await readSourcesCache(cacheKey);
    return jsonResponse(cached ?? staticSources, {
      headers: {
        ...publicCacheHeaders,
        "X-MMM-Source-Fallback": cached ? "cached" : "static-snapshot",
      },
    });
  }
}
