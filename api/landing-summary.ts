import { jsonResponse } from "./_lib/http.js";
import {
  landingSummaryResponseCacheKey,
  readCachedPublicResponse,
  writeCachedPublicResponse,
} from "./_lib/public-response-cache.js";
import { buildStaticLeaderboardResponse, getStaticLandingTopSources } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToLeaderboardResponse, buildLandingTopSourcesFromLeaderboardData } from "./_lib/static-mmm-overrides.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

const cacheReadTimeoutMs = 450;
const summaryBuildTimeoutMs = 400;
const forceRefreshSummaryBuildTimeoutMs = 6_000;

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

async function readLandingCache(cacheKey: string) {
  try {
    return await withTimeout(readCachedPublicResponse(cacheKey), cacheReadTimeoutMs, "landing cache read timed out");
  } catch (error) {
    console.error("[landing-summary] cache read failed", {
      error: describeError(error),
    });
    return null;
  }
}

async function buildLandingSummary() {
  const leaderboardUrl = new URL("https://mmm.local/api/leaderboard?page=1&pageSize=20");
  const [leaderboard, topSources] = await Promise.all([
    applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(leaderboardUrl), leaderboardUrl),
    buildLandingTopSourcesFromLeaderboardData(),
  ]);

  return {
    featuredRows: Array.isArray(leaderboard?.featuredRows) ? leaderboard.featuredRows.slice(0, 3) : [],
    topSources,
    generatedAt: new Date().toISOString(),
  };
}

function writeLandingCache(cacheKey: string, payload: unknown) {
  void writeCachedPublicResponse(cacheKey, payload).catch((error) => {
    console.error("[landing-summary] cache write failed", {
      error: describeError(error),
    });
  });
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const cacheKey = landingSummaryResponseCacheKey();
  const forceRefresh = url.searchParams.get("refreshCache") === "1";

  if (!forceRefresh) {
    const cached = await readLandingCache(cacheKey);
    if (cached) {
      return jsonResponse(cached, {
        headers: publicCacheHeaders,
      });
    }
  }

  try {
    const summary = await withTimeout(
      buildLandingSummary(),
      forceRefresh ? forceRefreshSummaryBuildTimeoutMs : summaryBuildTimeoutMs,
      "landing summary build timed out",
    );
    writeLandingCache(cacheKey, summary);
    return jsonResponse(summary, {
      headers: publicCacheHeaders,
    });
  } catch (error) {
    console.error("[landing-summary] build failed; returning static summary", {
      error: describeError(error),
    });

    const leaderboardUrl = new URL("https://mmm.local/api/leaderboard?page=1&pageSize=20");
    const staticLeaderboard = buildStaticLeaderboardResponse(leaderboardUrl);
    return jsonResponse({
      featuredRows: Array.isArray(staticLeaderboard.featuredRows) ? staticLeaderboard.featuredRows.slice(0, 3) : [],
      topSources: getStaticLandingTopSources(),
      generatedAt: new Date().toISOString(),
    }, {
      headers: {
        ...publicCacheHeaders,
        "X-MMM-Landing-Fallback": "static-snapshot",
      },
    });
  }
}
