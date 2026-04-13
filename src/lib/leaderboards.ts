import { fetchLeaderboardSummary } from "@/lib/leaderboard-repository";
import type { LeaderboardResponse } from "@/lib/types";

export interface LeaderboardRequestOptions {
  page?: number;
  pageSize?: number;
  query?: string;
  minBlocks?: number;
  highlightedPlayer?: string | null;
}

export async function getMainLeaderboard(limit = 100, options: LeaderboardRequestOptions = {}): Promise<LeaderboardResponse> {
  return fetchLeaderboardSummary({
    page: options.page,
    pageSize: options.pageSize ?? limit,
    query: options.query,
    minBlocks: options.minBlocks,
  });
}

export async function getSourceLeaderboard(sourceSlug: string, limit = 100, options: LeaderboardRequestOptions = {}): Promise<LeaderboardResponse> {
  return fetchLeaderboardSummary({
    source: sourceSlug,
    page: options.page,
    pageSize: options.pageSize ?? limit,
    query: options.query,
    minBlocks: options.minBlocks,
  });
}
