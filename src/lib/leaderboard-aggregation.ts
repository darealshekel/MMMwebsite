export type LeaderboardViewKind = "global" | "source";

export interface LeaderboardContribution {
  username: string;
  usernameLower?: string | null;
  playerId?: string | null;
  minecraftUuidHash?: string | null;
  internalUserId?: string | null;
  verifiedLinkedUsername?: string | null;
  sourceKey: string;
  sourceLabel: string;
  sourceKind: "world";
  blocksMined: number;
  lastUpdated: string;
  includeSourceView?: boolean;
}

export interface AggregatedLeaderboardRow {
  playerId: string | null;
  username: string;
  usernameLower: string;
  skinFaceUrl: string;
  lastUpdated: string;
  blocksMined: number;
  totalDigs: number;
  rank: number;
  sourceServer: string;
  sourceKey: string;
  sourceCount: number;
  viewKind: LeaderboardViewKind;
}

export interface AggregatedLeaderboardView {
  key: string;
  label: string;
  description: string;
  kind: LeaderboardViewKind;
  playerCount: number;
  totalBlocks: number;
  rows: AggregatedLeaderboardRow[];
}

export interface LeaderboardSourceTotals {
  totalBlocks: number;
}

type SourceContribution = {
  sourceKey: string;
  sourceLabel: string;
  sourceKind: "world";
  blocksMined: number;
  lastUpdated: string;
  includeSourceView: boolean;
};

type AggregatedPlayer = {
  username: string;
  usernameLower: string;
  playerId: string | null;
  minecraftUuidHash: string | null;
  internalUserId: string | null;
  sources: Map<string, SourceContribution>;
};

function normalizeUsername(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function toTimestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function chooseBetterUsername(current: string, candidate: string): string {
  if (!current) return candidate;
  if (!candidate) return current;
  if (current.toLowerCase() === current && candidate.toLowerCase() !== candidate) {
    return candidate;
  }
  return current.length >= candidate.length ? current : candidate;
}

function assignRanks<T extends { blocksMined: number }>(
  rows: T[],
): Array<T & { rank: number }> {
  let previousScore: number | null = null;
  let previousRank = 0;

  return rows.map((row, index) => {
    const rank =
      previousScore !== null && row.blocksMined === previousScore
        ? previousRank
        : index + 1;
    previousScore = row.blocksMined;
    previousRank = rank;
    return { ...row, rank };
  });
}

export function aggregateLeaderboardViews(
  contributions: LeaderboardContribution[],
  sourceTotals: ReadonlyMap<string, LeaderboardSourceTotals> = new Map(),
): AggregatedLeaderboardView[] {
  const players = new Map<string, AggregatedPlayer>();

  for (const contribution of contributions) {
    if (!contribution.username || contribution.blocksMined <= 0 || !contribution.sourceKey) {
      continue;
    }

    const identityKey =
      contribution.playerId ||
      contribution.minecraftUuidHash ||
      contribution.internalUserId ||
      normalizeUsername(contribution.username);

    const existingPlayer = players.get(identityKey) ?? {
      username: contribution.username,
      usernameLower: normalizeUsername(contribution.usernameLower ?? contribution.username),
      playerId: contribution.playerId ?? null,
      minecraftUuidHash: contribution.minecraftUuidHash ?? null,
      internalUserId: contribution.internalUserId ?? null,
      sources: new Map<string, SourceContribution>(),
    };

    existingPlayer.username = chooseBetterUsername(existingPlayer.username, contribution.username);
    existingPlayer.usernameLower =
      existingPlayer.usernameLower ||
      normalizeUsername(contribution.usernameLower ?? contribution.username);
    existingPlayer.playerId = existingPlayer.playerId ?? contribution.playerId ?? null;
    existingPlayer.minecraftUuidHash =
      existingPlayer.minecraftUuidHash ?? contribution.minecraftUuidHash ?? null;
    existingPlayer.internalUserId =
      existingPlayer.internalUserId ?? contribution.internalUserId ?? null;

    const existingSource = existingPlayer.sources.get(contribution.sourceKey);
    if (
      !existingSource ||
      contribution.blocksMined > existingSource.blocksMined ||
      (contribution.blocksMined === existingSource.blocksMined &&
        toTimestamp(contribution.lastUpdated) > toTimestamp(existingSource.lastUpdated))
    ) {
      existingPlayer.sources.set(contribution.sourceKey, {
        sourceKey: contribution.sourceKey,
        sourceLabel: contribution.sourceLabel,
        sourceKind: "world",
        blocksMined: contribution.blocksMined,
        lastUpdated: contribution.lastUpdated,
        includeSourceView: contribution.includeSourceView !== false,
      });
    }

    players.set(identityKey, existingPlayer);
  }

  const globalRowsBase: AggregatedLeaderboardRow[] = Array.from(players.values())
    .map((player) => {
      const sources: SourceContribution[] = Array.from(player.sources.values());

      const totalBlocks = sources.reduce(
        (sum: number, source: SourceContribution) => sum + source.blocksMined,
        0,
      );

      const lastUpdated =
        sources
          .map((source: SourceContribution) => source.lastUpdated)
          .sort((a: string, b: string) => toTimestamp(b) - toTimestamp(a))[0] ??
        new Date(0).toISOString();

      return {
        playerId: player.playerId,
        username: player.username,
        usernameLower: player.usernameLower,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(player.username)}/48`,
        lastUpdated,
        blocksMined: totalBlocks,
        totalDigs: totalBlocks,
        rank: 0,
        sourceServer: `${sources.length} ${sources.length === 1 ? "source" : "sources"}`,
        sourceKey: "global",
        sourceCount: sources.length,
        viewKind: "global" as const,
      };
    })
    .filter((row) => row.blocksMined > 0)
    .sort(
      (a, b) =>
        b.blocksMined - a.blocksMined ||
        toTimestamp(b.lastUpdated) - toTimestamp(a.lastUpdated) ||
        a.username.localeCompare(b.username),
    );

  const globalView: AggregatedLeaderboardView = {
    key: "global",
    label: "Main Leaderboard",
    description: "Totals across every approved server and world.",
    kind: "global",
    playerCount: globalRowsBase.length,
    totalBlocks: globalRowsBase.reduce((sum, row) => sum + row.blocksMined, 0),
    rows: assignRanks(globalRowsBase),
  };

  const sourceViews = new Map<string, AggregatedLeaderboardView>();

  for (const player of players.values()) {
    const playerSources: SourceContribution[] = Array.from(player.sources.values());

    for (const source of playerSources) {
      if (!source.includeSourceView) continue;

      const view = sourceViews.get(source.sourceKey) ?? {
        key: source.sourceKey,
        label: source.sourceLabel,
        description: `Totals from ${source.sourceLabel}.`,
        kind: "source" as const,
        playerCount: 0,
        totalBlocks: 0,
        rows: [] as AggregatedLeaderboardRow[],
      };

      view.rows.push({
        playerId: player.playerId,
        username: player.username,
        usernameLower: player.usernameLower,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(player.username)}/48`,
        lastUpdated: source.lastUpdated,
        blocksMined: source.blocksMined,
        totalDigs: source.blocksMined,
        rank: 0,
        sourceServer: source.sourceLabel,
        sourceKey: source.sourceKey,
        sourceCount: 1,
        viewKind: "source" as const,
      });

      sourceViews.set(source.sourceKey, view);
    }
  }

  const orderedSourceViews: AggregatedLeaderboardView[] = Array.from(sourceViews.values())
    .map((view) => {
      const sortedRows = [...view.rows].sort(
        (a, b) =>
          b.blocksMined - a.blocksMined ||
          toTimestamp(b.lastUpdated) - toTimestamp(a.lastUpdated) ||
          a.username.localeCompare(b.username),
      );

      const override = sourceTotals.get(view.key);

      return {
        ...view,
        playerCount: sortedRows.length,
        totalBlocks:
          override?.totalBlocks ??
          sortedRows.reduce((sum, row) => sum + row.blocksMined, 0),
        rows: assignRanks(sortedRows),
      };
    })
    .sort((a, b) => b.totalBlocks - a.totalBlocks || a.label.localeCompare(b.label));

  return [globalView, ...orderedSourceViews];
}

export function filterLeaderboardRows(
  rows: AggregatedLeaderboardRow[],
  query: string,
  minBlocks: number,
): AggregatedLeaderboardRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesQuery =
      normalizedQuery === "" || row.usernameLower.includes(normalizedQuery);
    const matchesBlocks = row.blocksMined >= minBlocks;
    return matchesQuery && matchesBlocks;
  });
}

export function paginateLeaderboardRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
) {
  const safePageSize = Math.max(1, Math.min(pageSize, 100));
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * safePageSize;

  return {
    page: currentPage,
    pageSize: safePageSize,
    totalRows,
    totalPages,
    rows: rows.slice(start, start + safePageSize),
  };
}
