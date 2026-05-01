import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { apiUrl, logLocalApiFailure, readResponseBody, shouldUseLocalStaticFallback } from "@/lib/local-runtime";
import {
  localLandingSummary,
  localLeaderboardSummary,
  localPlayerDetail,
  localPublicSources,
  localSpecialLeaderboardSummary,
} from "@/lib/local-static-data";
import type { LeaderboardResponse, PlayerDetailResponse, SpecialLeaderboardResponse } from "@/lib/types";

export interface LandingSummaryResponse {
  featuredRows: LeaderboardResponse["featuredRows"];
  topSources: LeaderboardResponse["publicSources"];
  generatedAt: string;
}

export interface FetchLeaderboardOptions {
  source?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  minBlocks?: number;
  includeSources?: boolean;
}

const PUBLIC_DATA_VERSION = "canonical-ranks-v3";

function normalizePlayerDetailResponse(player: PlayerDetailResponse | null): PlayerDetailResponse | null {
  if (!player) return player;
  return {
    ...player,
    places: Array.isArray(player.servers) ? player.servers.length : player.places,
  };
}

function logFailedResponse(label: string, url: string, status: number, body: string) {
  logLocalApiFailure(label, { url, status, body });
}

async function fetchJson<T>(url: string, label: string, timeoutMs = 8_000, localFallback?: () => Promise<T>): Promise<T> {
  const requestUrl = apiUrl(url);

  let response: Response;
  try {
    response = await fetchWithTimeout(requestUrl, {
      headers: {
        Accept: "application/json",
      },
      timeoutMs,
      timeoutMessage: `${label} request timed out.`,
    });
  } catch (error) {
    logLocalApiFailure(label, {
      url: requestUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    if (localFallback && shouldUseLocalStaticFallback()) {
      return localFallback();
    }
    throw error;
  }

  if (!response.ok) {
    const text = await readResponseBody(response);
    logFailedResponse(label, requestUrl, response.status, text);
    if (localFallback && shouldUseLocalStaticFallback()) {
      return localFallback();
    }
    throw new Error(`${label} request failed: ${response.status} ${text}`);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    logLocalApiFailure(label, {
      url: requestUrl,
      status: response.status,
      contentType: response.headers.get("content-type"),
      error: error instanceof Error ? error.message : String(error),
    });
    if (localFallback && shouldUseLocalStaticFallback()) {
      return localFallback();
    }
    throw error;
  }
}

export async function fetchLeaderboardSummary(
  params: FetchLeaderboardOptions
): Promise<LeaderboardResponse> {
  const search = new URLSearchParams();
  search.set("dataVersion", PUBLIC_DATA_VERSION);

  if (params.source) search.set("source", params.source);
  if (typeof params.page === "number") search.set("page", String(params.page));
  if (typeof params.pageSize === "number") search.set("pageSize", String(params.pageSize));

  const query = params.query?.trim();
  if (query) search.set("query", query);

  if (typeof params.minBlocks === "number") {
    search.set("minBlocks", String(params.minBlocks));
  }
  if (params.includeSources) {
    search.set("includeSources", "1");
  }

  const url = `/api/leaderboard?${search.toString()}`;
  return fetchJson<LeaderboardResponse>(url, "Leaderboard", 5_000, () => localLeaderboardSummary(params));
}

export async function fetchSpecialLeaderboardSummary(
  kind: string,
  params: Omit<FetchLeaderboardOptions, "source"> = {}
): Promise<SpecialLeaderboardResponse> {
  const search = new URLSearchParams();
  search.set("dataVersion", PUBLIC_DATA_VERSION);
  search.set("kind", kind);

  if (typeof params.page === "number") search.set("page", String(params.page));
  if (typeof params.pageSize === "number") search.set("pageSize", String(params.pageSize));

  const query = params.query?.trim();
  if (query) search.set("query", query);

  if (typeof params.minBlocks === "number") {
    search.set("minBlocks", String(params.minBlocks));
  }
  if (params.includeSources) {
    search.set("includeSources", "1");
  }

  const url = `/api/leaderboard-special?${search.toString()}`;
  return fetchJson<SpecialLeaderboardResponse>(url, "Special leaderboard", 5_000, () => localSpecialLeaderboardSummary(kind, params));
}

export async function fetchPublicSources(): Promise<LeaderboardResponse["publicSources"]> {
  return fetchJson<LeaderboardResponse["publicSources"]>("/api/leaderboard-sources", "Leaderboard sources", 6_000, localPublicSources);
}

export async function fetchLandingSummary(): Promise<LandingSummaryResponse> {
  return fetchJson<LandingSummaryResponse>("/api/landing-summary", "Landing summary", 3_000, localLandingSummary);
}

export async function fetchPlayerDetail(slug: string): Promise<PlayerDetailResponse | null> {
  const search = new URLSearchParams();
  search.set("dataVersion", PUBLIC_DATA_VERSION);
  search.set("slug", slug);

  const url = `/api/player-detail?${search.toString()}`;
  const requestUrl = apiUrl(url);

  let response: Response;
  try {
    response = await fetchWithTimeout(requestUrl, {
      headers: {
        Accept: "application/json",
      },
      timeoutMs: 5_000,
      timeoutMessage: "Player detail request timed out.",
    });
  } catch (error) {
    logLocalApiFailure("Player detail", {
      url: requestUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    if (shouldUseLocalStaticFallback()) {
      return normalizePlayerDetailResponse(await localPlayerDetail(slug));
    }
    throw error;
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await readResponseBody(response);
    logFailedResponse("Player detail", requestUrl, response.status, text);
    if (shouldUseLocalStaticFallback()) {
      return normalizePlayerDetailResponse(await localPlayerDetail(slug));
    }
    throw new Error(`Player detail request failed: ${response.status} ${text}`);
  }

  return normalizePlayerDetailResponse((await response.json()) as PlayerDetailResponse);
}
