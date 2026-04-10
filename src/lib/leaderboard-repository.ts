import type { LeaderboardResponse } from "@/lib/types";

export interface FetchLeaderboardOptions {
  view?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  minBlocks?: number;
}

export async function fetchLeaderboardSummary(
  params: FetchLeaderboardOptions
): Promise<LeaderboardResponse> {
  const search = new URLSearchParams();

  if (params.view) search.set("view", params.view);
  if (typeof params.page === "number") search.set("page", String(params.page));
  if (typeof params.pageSize === "number") search.set("pageSize", String(params.pageSize));

  const query = params.query?.trim();
  if (query) search.set("query", query);

  if (typeof params.minBlocks === "number") {
    search.set("minBlocks", String(params.minBlocks));
  }

  const url = `/api/leaderboard?${search.toString()}`;
  console.log("fetchLeaderboardSummary requesting", url);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  console.log("fetchLeaderboardSummary status", response.status);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Leaderboard request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as LeaderboardResponse;
}
