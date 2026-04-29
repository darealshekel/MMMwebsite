import { jsonResponse } from "./_lib/http.js";
import {
  landingSummaryResponseCacheKey,
  publicSourcesResponseCacheKey,
  readCachedPublicResponse,
  writeCachedPublicResponse,
} from "./_lib/public-response-cache.js";
import { buildStaticLeaderboardResponse, getStaticPublicSources } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToLeaderboardResponse, applyStaticManualOverridesToSources } from "./_lib/static-mmm-overrides.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

const cacheReadTimeoutMs = 450;
const publicSourcesCacheTimeoutMs = 180;
const publicSourcesBuildTimeoutMs = 2_500;
const forceRefreshPublicSourcesBuildTimeoutMs = 5_000;
const summaryBuildTimeoutMs = 3_000;
const forceRefreshSummaryBuildTimeoutMs = 6_000;

type JsonRecord = Record<string, unknown>;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

function minimalSource(source: JsonRecord) {
  return {
    id: String(source.id ?? source.slug ?? source.displayName ?? ""),
    slug: String(source.slug ?? source.id ?? ""),
    displayName: String(source.displayName ?? source.slug ?? "Unknown Source"),
    sourceType: String(source.sourceType ?? "server"),
    logoUrl: typeof source.logoUrl === "string" ? source.logoUrl : null,
    totalBlocks: toNumber(source.totalBlocks),
    isDead: Boolean(source.isDead),
    playerCount: toNumber(source.playerCount),
    sourceScope: typeof source.sourceScope === "string" ? source.sourceScope : undefined,
    hasSpreadsheetTotal: Boolean(source.hasSpreadsheetTotal),
  };
}

function topSources(sources: JsonRecord[]) {
  return [...sources]
    .map(minimalSource)
    .sort((left, right) => {
      const diff = right.totalBlocks - left.totalBlocks;
      return diff || left.displayName.localeCompare(right.displayName);
    })
    .slice(0, 3);
}

async function readPublicSourcesCache() {
  try {
    const cached = await withTimeout(
      readCachedPublicResponse(publicSourcesResponseCacheKey()),
      publicSourcesCacheTimeoutMs,
      "public sources cache read timed out",
    );
    return Array.isArray(cached) ? cached as JsonRecord[] : null;
  } catch (error) {
    console.error("[landing-summary] public sources cache read failed", {
      error: describeError(error),
    });
    return null;
  }
}

async function buildCanonicalPublicSources(forceRefresh: boolean) {
  try {
    const sources = await withTimeout(
      applyStaticManualOverridesToSources(getStaticPublicSources()),
      forceRefresh ? forceRefreshPublicSourcesBuildTimeoutMs : publicSourcesBuildTimeoutMs,
      "canonical public sources build timed out",
    );
    void writeCachedPublicResponse(publicSourcesResponseCacheKey(), sources).catch((error) => {
      console.error("[landing-summary] public sources cache write failed", {
        error: describeError(error),
      });
    });
    return sources;
  } catch (error) {
    const cachedSources = await readPublicSourcesCache();
    if (cachedSources) {
      return cachedSources;
    }
    throw error;
  }
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

async function buildLandingSummary(forceRefresh: boolean) {
  const leaderboardUrl = new URL("https://mmm.local/api/leaderboard?page=1&pageSize=20");
  const [leaderboard, sources] = await Promise.all([
    applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(leaderboardUrl), leaderboardUrl),
    buildCanonicalPublicSources(forceRefresh),
  ]);

  return {
    featuredRows: Array.isArray(leaderboard?.featuredRows) ? leaderboard.featuredRows.slice(0, 3) : [],
    topSources: topSources((sources ?? []) as JsonRecord[]),
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
      buildLandingSummary(forceRefresh),
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
      topSources: topSources(getStaticPublicSources() as JsonRecord[]),
      generatedAt: new Date().toISOString(),
    }, {
      headers: {
        ...publicCacheHeaders,
        "X-MMM-Landing-Fallback": "static-snapshot",
      },
    });
  }
}
