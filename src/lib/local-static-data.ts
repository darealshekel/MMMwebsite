import type { LandingSummaryResponse } from "@/lib/leaderboard-repository";
import type { LeaderboardResponse, LeaderboardRowSummary, PlayerDetailResponse, PlayerServerStatSummary, PublicSourceSummary, SpecialLeaderboardResponse } from "@/lib/types";

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

const LOCAL_PUBLIC_PLAYER_ROWS = new Map<string, Partial<LeaderboardRowSummary>>([
  ["5hekel", {
    blocksMined: 16_017_660,
    totalDigs: 16_017_660,
    rank: 90,
    sourceCount: 7,
    sourceServer: "Sigma SMP",
    sourceId: "private:969a974231f34f2fe16142fd349826ca",
    sourceSlug: "redtech",
  }],
  ["1uu1", {
    blocksMined: 16_307_807,
    totalDigs: 16_307_807,
    rank: 87,
    sourceCount: 2,
    sourceServer: "Hekate",
  }],
  ["narutaku21", {
    blocksMined: 16_505_766,
    totalDigs: 16_505_766,
    rank: 84,
    sourceCount: 2,
    sourceServer: "Narutaku SMP",
  }],
]);

const LOCAL_5HEKEL_SERVERS: PlayerServerStatSummary[] = [
  {
    sourceId: "private:969a974231f34f2fe16142fd349826ca",
    sourceSlug: "redtech",
    server: "RedTech",
    blocks: 8_243_000,
    rank: 1,
    joined: "2026",
    sourceType: "server",
  },
  {
    sourceId: "private:676a617afc5312b1a2351bdc58f08d36",
    sourceSlug: "aeternum",
    server: "Aeternum",
    blocks: 2_180_000,
    rank: 21,
    joined: "2026",
    sourceType: "server",
  },
  {
    sourceId: "submission:ssp",
    sourceSlug: "ssp",
    server: "SSP World",
    blocks: 1_600_000,
    rank: 1,
    joined: "2026",
    sourceType: "ssp",
    sourceCategory: "ssp",
    sourceScope: "private_singleplayer",
    logoUrl: "/generated/mmm-source-logos/53af69d6f765a123be8e19bb6486fca6.png",
  },
  {
    sourceId: "private:043c4cc098a8e0a34d27b2ca83e791a4",
    sourceSlug: "mercury",
    server: "Mercury",
    blocks: 1_463_524,
    rank: 4,
    joined: "2026",
    sourceType: "server",
  },
  {
    sourceId: "digs:4313adac9896eb88f412331a9cdb8126",
    sourceSlug: "phoenix",
    server: "Phoenix",
    blocks: 1_296_136,
    rank: 1,
    joined: "2026",
    sourceType: "server",
  },
  {
    sourceId: "private:bb7a7a248e0698809846366803707106",
    sourceSlug: "sigma-smp",
    server: "Sigma SMP",
    blocks: 1_183_000,
    rank: 35,
    joined: "2026",
    sourceType: "server",
  },
  {
    sourceId: "private:1ef4159bc40523931c32109ba0e31198",
    sourceSlug: "enigma",
    server: "Enigma",
    blocks: 52_000,
    rank: 102,
    joined: "2026",
    sourceType: "server",
  },
];

function applyLocalPublicRowOverrides(rows: LeaderboardRowSummary[]) {
  return rows.map((row) => {
    const override = LOCAL_PUBLIC_PLAYER_ROWS.get(row.username.trim().toLowerCase());
    return override ? { ...row, ...override } : row;
  });
}

function applyLocalPublicLeaderboardOverrides(response: LeaderboardResponse): LeaderboardResponse {
  return {
    ...response,
    rows: applyLocalPublicRowOverrides(response.rows),
    featuredRows: applyLocalPublicRowOverrides(response.featuredRows),
  };
}

function applyLocalPublicPlayerDetailOverrides(detail: PlayerDetailResponse | null): PlayerDetailResponse | null {
  if (!detail || detail.name.trim().toLowerCase() !== "5hekel") {
    return detail;
  }

  return {
    ...detail,
    rank: 90,
    blocksNum: 16_017_660,
    places: LOCAL_5HEKEL_SERVERS.length,
    servers: LOCAL_5HEKEL_SERVERS,
  };
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
  return applyLocalPublicLeaderboardOverrides(response as LeaderboardResponse);
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
  const [leaderboard, mod] = await Promise.all([
    localLeaderboardSummary({ page: 1, pageSize: 20 }),
    loadStaticModule(),
  ]);

  return {
    featuredRows: leaderboard.featuredRows.slice(0, 3),
    topSources: mod.getStaticLandingTopSources() as PublicSourceSummary[],
    generatedAt: new Date().toISOString(),
  };
}

export async function localPlayerDetail(slug: string) {
  const mod = await loadStaticModule();
  return applyLocalPublicPlayerDetailOverrides(
    mod.buildStaticPlayerDetailResponse(leaderboardUrl("/api/player-detail", { slug })) as PlayerDetailResponse | null,
  );
}
