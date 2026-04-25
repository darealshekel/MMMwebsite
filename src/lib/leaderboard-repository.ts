import type { LeaderboardResponse, PlayerDetailResponse, SpecialLeaderboardResponse } from "@/lib/types";

export interface FetchLeaderboardOptions {
  source?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  minBlocks?: number;
  includeSources?: boolean;
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

  const url = `/api/leaderboard?${search.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Leaderboard request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as LeaderboardResponse;
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
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Special leaderboard request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as SpecialLeaderboardResponse;
}

export async function fetchPublicSources(): Promise<LeaderboardResponse["publicSources"]> {
  const response = await fetch("/api/leaderboard-sources", {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Leaderboard sources request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as LeaderboardResponse["publicSources"];
}

export async function fetchPlayerDetail(slug: string): Promise<PlayerDetailResponse | null> {
  const search = new URLSearchParams();
  search.set("slug", slug);

  const response = await fetch(`/api/player-detail?${search.toString()}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Player detail request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as PlayerDetailResponse;
}
