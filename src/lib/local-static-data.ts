import type { LandingSummaryResponse } from "@/lib/leaderboard-repository";
import type { LeaderboardResponse, PlayerDetailResponse, PublicSourceSummary, SpecialLeaderboardResponse } from "@/lib/types";

type StaticLeaderboardModule = typeof import("../../api/_lib/static-mmm-leaderboard.js");

let staticModulePromise: Promise<StaticLeaderboardModule> | null = null;

function loadStaticModule() {
  staticModulePromise ??= import("../../api/_lib/static-mmm-leaderboard.js");
  return staticModulePromise;
}

function leaderboardUrl(path: string, params: Record<string, string | number | boolean | undefined>) {
  const url = new URL(`https://mmm.local${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== false && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

function topSources(sources: PublicSourceSummary[]) {
  return [...sources]
    .sort((left, right) => {
      const delta = Number(right.totalBlocks ?? 0) - Number(left.totalBlocks ?? 0);
      return delta || left.displayName.localeCompare(right.displayName);
    })
    .slice(0, 3);
}

export async function localLeaderboardSummary(params: {
  source?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  minBlocks?: number;
  includeSources?: boolean;
}) {
  const mod = await loadStaticModule();
  const response = mod.buildStaticLeaderboardResponse(leaderboardUrl("/api/leaderboard", params));
  if (!response) {
    throw new Error("Local static leaderboard snapshot was not available.");
  }
  return response as LeaderboardResponse;
}

export async function localSpecialLeaderboardSummary(
  kind: string,
  params: {
    page?: number;
    pageSize?: number;
    query?: string;
    minBlocks?: number;
    includeSources?: boolean;
  } = {},
) {
  const mod = await loadStaticModule();
  const response = mod.buildStaticSpecialLeaderboardResponse(leaderboardUrl("/api/leaderboard-special", { kind, ...params }));
  if (!response) {
    throw new Error("Local static special leaderboard snapshot was not available.");
  }
  return response as SpecialLeaderboardResponse;
}

export async function localPublicSources() {
  const mod = await loadStaticModule();
  return mod.getStaticPublicSources() as PublicSourceSummary[];
}

export async function localLandingSummary(): Promise<LandingSummaryResponse> {
  const [leaderboard, sources] = await Promise.all([
    localLeaderboardSummary({ page: 1, pageSize: 20 }),
    localPublicSources(),
  ]);

  return {
    featuredRows: leaderboard.featuredRows.slice(0, 3),
    topSources: topSources(sources),
    generatedAt: new Date().toISOString(),
  };
}

export async function localPlayerDetail(slug: string) {
  const mod = await loadStaticModule();
  return mod.buildStaticPlayerDetailResponse(leaderboardUrl("/api/player-detail", { slug })) as PlayerDetailResponse | null;
}
