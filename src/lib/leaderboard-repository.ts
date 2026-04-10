import { appEnv } from "@/lib/env";
import type { LeaderboardResponse } from "@/lib/types";

export interface FetchLeaderboardOptions {
  view?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  minBlocks?: number;
}

export async function fetchLeaderboardSummary(options: FetchLeaderboardOptions = {}): Promise<LeaderboardResponse> {
  const url = new URL("/api/leaderboard", window.location.origin);

  if (options.view) url.searchParams.set("view", options.view);
  if (options.page) url.searchParams.set("page", String(options.page));
  if (options.pageSize) url.searchParams.set("pageSize", String(options.pageSize));
  if (options.query) url.searchParams.set("query", options.query);
  if (options.minBlocks && options.minBlocks > 0) url.searchParams.set("minBlocks", String(options.minBlocks));

  const response = await fetch(url.toString(), {
  cache: "no-store",
  headers: {
    Accept: "application/json",
  },
  });

  if (!response.ok) {
    throw new Error(`Leaderboard request failed (${response.status})`);
  }

  const payload = (await response.json()) as LeaderboardResponse;
  return {
    ...payload,
    highlightedPlayer: payload.highlightedPlayer ?? appEnv.defaultPlayerUsername ?? null,
  };
}
