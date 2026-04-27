import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
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

async function readErrorBody(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function logFailedResponse(label: string, url: string, status: number, body: string) {
  if (import.meta.env.DEV) {
    console.error(`${label} request failed`, {
      url,
      status,
      body,
    });
  }
}

async function fetchJson<T>(url: string, label: string, timeoutMs = 8_000): Promise<T> {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
    },
    timeoutMs,
    timeoutMessage: `${label} request timed out.`,
  });

  if (!response.ok) {
    const text = await readErrorBody(response);
    logFailedResponse(label, url, response.status, text);
    throw new Error(`${label} request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

export async function fetchLeaderboardSummary(
  params: FetchLeaderboardOptions
): Promise<LeaderboardResponse> {
  const search = new URLSearchParams();

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
  return fetchJson<LeaderboardResponse>(url, "Leaderboard");
}

export async function fetchSpecialLeaderboardSummary(
  kind: string,
  params: Omit<FetchLeaderboardOptions, "source"> = {}
): Promise<SpecialLeaderboardResponse> {
  const search = new URLSearchParams();
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
  return fetchJson<SpecialLeaderboardResponse>(url, "Special leaderboard");
}

export async function fetchPublicSources(): Promise<LeaderboardResponse["publicSources"]> {
  return fetchJson<LeaderboardResponse["publicSources"]>("/api/leaderboard-sources", "Leaderboard sources", 6_000);
}

export async function fetchLandingSummary(): Promise<LandingSummaryResponse> {
  return fetchJson<LandingSummaryResponse>("/api/landing-summary", "Landing summary", 3_000);
}

export async function fetchPlayerDetail(slug: string): Promise<PlayerDetailResponse | null> {
  const search = new URLSearchParams();
  search.set("slug", slug);

  const url = `/api/player-detail?${search.toString()}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
    },
    timeoutMs: 8_000,
    timeoutMessage: "Player detail request timed out.",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await readErrorBody(response);
    logFailedResponse("Player detail", url, response.status, text);
    throw new Error(`Player detail request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as PlayerDetailResponse;
}
