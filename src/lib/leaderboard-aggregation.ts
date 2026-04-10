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
  sourceKind: "aeternum" | "world";
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
  sourceKind: "aeternum" | "world";
  blocksMined: number;
  lastUpdated: string;
  includeSourceView: boolean;
};

type AggregatedIdentity = {
  username: string;
  usernameLower: string;
  playerId: string | null;
  internalUserId: string | null;
  minecraftUuidHash: string | null;
  aliases: Set<string>;
  hasStableIdentity: boolean;
  perSource: Map<string, SourceContribution>;
};

function normalizeUsername(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toTimestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildAliases(contribution: LeaderboardContribution) {
  const usernameLower = normalizeUsername(contribution.usernameLower ?? contribution.username);
  const stableAliases: string[] = [];

  if (contribution.internalUserId) stableAliases.push(`user:${contribution.internalUserId}`);
  if (contribution.minecraftUuidHash) stableAliases.push(`uuid:${contribution.minecraftUuidHash}`);
  if (contribution.playerId) stableAliases.push(`player:${contribution.playerId}`);
  if (!contribution.internalUserId && contribution.verifiedLinkedUsername) {
    stableAliases.push(`verified:${normalizeUsername(contribution.verifiedLinkedUsername)}`);
  }

  return {
    usernameLower,
    stableAliases,
    usernameAlias: usernameLower ? `username:${usernameLower}` : null,
  };
}

function chooseBetterUsername(current: string, candidate: string) {
  if (!current) return candidate;
  if (!candidate) return current;
  if (current.toLowerCase() === current && candidate.toLowerCase() !== candidate) {
    return candidate;
  }
  return current.length >= candidate.length ? current : candidate;
}

function mergeGroups(target: AggregatedIdentity, source: AggregatedIdentity) {
  target.username = chooseBetterUsername(target.username, source.username);
  target.usernameLower = target.usernameLower || source.usernameLower;
  target.playerId = target.playerId ?? source.playerId;
  target.internalUserId = target.internalUserId ?? source.internalUserId;
  target.minecraftUuidHash = target.minecraftUuidHash ?? source.minecraftUuidHash;
  target.hasStableIdentity = target.hasStableIdentity || source.hasStableIdentity;

  for (const alias of source.aliases) {
    target.aliases.add(alias);
  }

  for (const [sourceKey, contribution] of source.perSource) {
    const existing = target.perSource.get(sourceKey);
    if (!existing || contribution.blocksMined > existing.blocksMined || (contribution.blocksMined === existing.blocksMined && toTimestamp(contribution.lastUpdated) > toTimestamp(existing.lastUpdated))) {
      target.perSource.set(sourceKey, contribution);
    }
  }
}

function assignRanks<T extends { blocksMined: number }>(rows: T[]) {
  let previousScore: number | null = null;
  let previousRank = 0;

  return rows.map((row, index) => {
    const rank = previousScore !== null && row.blocksMined === previousScore ? previousRank : index + 1;
    previousScore = row.blocksMined;
    previousRank = rank;
    return { ...row, rank };
  });
}

export function aggregateLeaderboardViews(
  contributions: LeaderboardContribution[],
  sourceTotals: ReadonlyMap<string, LeaderboardSourceTotals> = new Map(),
): AggregatedLeaderboardView[] {
  const groups: AggregatedIdentity[] = [];

  for (const contribution of contributions) {
    if (!contribution.username || contribution.blocksMined <= 0 || !contribution.sourceKey) {
      continue;
    }

    const { usernameLower, stableAliases, usernameAlias } = buildAliases(contribution);
    const matched: AggregatedIdentity[] = [];

    for (const group of groups) {
      const stableMatch = stableAliases.some((alias) => group.aliases.has(alias));
      const usernameMatch = stableAliases.length === 0
        && usernameAlias
        && group.hasStableIdentity === false
        && group.aliases.has(usernameAlias);

      if (stableMatch || usernameMatch) {
        matched.push(group);
      }
    }

    const group = matched[0] ?? {
      username: contribution.username,
      usernameLower,
      playerId: contribution.playerId ?? null,
      internalUserId: contribution.internalUserId ?? null,
      minecraftUuidHash: contribution.minecraftUuidHash ?? null,
      aliases: new Set<string>(),
      hasStableIdentity: stableAliases.length > 0,
      perSource: new Map<string, SourceContribution>(),
    } satisfies AggregatedIdentity;

    if (matched.length === 0) {
      groups.push(group);
    } else if (matched.length > 1) {
      for (const duplicate of matched.slice(1)) {
        mergeGroups(group, duplicate);
        groups.splice(groups.indexOf(duplicate), 1);
      }
    }

    group.username = chooseBetterUsername(group.username, contribution.username);
    group.usernameLower = group.usernameLower || usernameLower;
    group.playerId = group.playerId ?? contribution.playerId ?? null;
    group.internalUserId = group.internalUserId ?? contribution.internalUserId ?? null;
    group.minecraftUuidHash = group.minecraftUuidHash ?? contribution.minecraftUuidHash ?? null;
    group.hasStableIdentity = group.hasStableIdentity || stableAliases.length > 0;

    for (const alias of stableAliases) {
      group.aliases.add(alias);
    }
    if (stableAliases.length === 0 && usernameAlias) {
      group.aliases.add(usernameAlias);
    }

    const existing = group.perSource.get(contribution.sourceKey);
    if (!existing || contribution.blocksMined > existing.blocksMined || (contribution.blocksMined === existing.blocksMined && toTimestamp(contribution.lastUpdated) > toTimestamp(existing.lastUpdated))) {
      group.perSource.set(contribution.sourceKey, {
        sourceKey: contribution.sourceKey,
        sourceLabel: contribution.sourceLabel,
        sourceKind: contribution.sourceKind,
        blocksMined: contribution.blocksMined,
        lastUpdated: contribution.lastUpdated,
        includeSourceView: contribution.includeSourceView !== false,
      });
    }
  }

  const sourceViews = new Map<string, AggregatedLeaderboardView>();
  const globalRowsBase = groups
    .map((group) => {
      const perSource = Array.from(group.perSource.values());
      const blocksMined = perSource.reduce((sum, source) => sum + source.blocksMined, 0);
      const lastUpdated = perSource
        .map((source) => source.lastUpdated)
        .sort((left, right) => toTimestamp(right) - toTimestamp(left))[0] ?? new Date(0).toISOString();

      return {
        playerId: group.playerId,
        username: group.username,
        usernameLower: group.usernameLower,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(group.username)}/48`,
        lastUpdated,
        blocksMined,
        totalDigs: blocksMined,
        sourceServer: `${perSource.length} ${perSource.length === 1 ? "place" : "places"}`,
        sourceKey: "global",
        sourceCount: perSource.length,
        viewKind: "global" as const,
      };
    })
    .filter((row) => row.blocksMined > 0)
    .sort((a, b) => b.blocksMined - a.blocksMined || toTimestamp(b.lastUpdated) - toTimestamp(a.lastUpdated) || a.username.localeCompare(b.username));

  for (const group of groups) {
    for (const contribution of group.perSource.values()) {
      if (contribution.includeSourceView === false) {
        continue;
      }
      const view = sourceViews.get(contribution.sourceKey) ?? {
        key: contribution.sourceKey,
        label: contribution.sourceLabel,
        description: `Totals from ${contribution.sourceLabel}.`,
        kind: "source" as const,
        playerCount: 0,
        totalBlocks: 0,
        rows: [],
      };

      view.rows.push({
        playerId: group.playerId,
        username: group.username,
        usernameLower: group.usernameLower,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(group.username)}/48`,
        lastUpdated: contribution.lastUpdated,
        blocksMined: contribution.blocksMined,
        totalDigs: contribution.blocksMined,
        rank: 0,
        sourceServer: contribution.sourceLabel,
        sourceKey: contribution.sourceKey,
        sourceCount: 1,
        viewKind: "source",
      });
      sourceViews.set(contribution.sourceKey, view);
    }
  }

  const globalView: AggregatedLeaderboardView = {
    key: "global",
    label: "Main Leaderboard",
    description: "Totals across every approved server and world.",
    kind: "global",
    playerCount: globalRowsBase.length,
    totalBlocks: globalRowsBase.reduce((sum, row) => sum + row.blocksMined, 0),
    rows: assignRanks(globalRowsBase),
  };

  const orderedSourceViews = Array.from(sourceViews.values())
    .map((view) => {
      const sortedRows = view.rows
        .sort((a, b) => b.blocksMined - a.blocksMined || toTimestamp(b.lastUpdated) - toTimestamp(a.lastUpdated) || a.username.localeCompare(b.username));
      const override = sourceTotals.get(view.key);
      return {
        ...view,
        playerCount: sortedRows.length,
        totalBlocks: override?.totalBlocks ?? sortedRows.reduce((sum, row) => sum + row.blocksMined, 0),
        rows: assignRanks(sortedRows),
      };
    })
    .sort((a, b) => {
      if (a.label === "Aeternum") return -1;
      if (b.label === "Aeternum") return 1;
      return b.totalBlocks - a.totalBlocks || a.label.localeCompare(b.label);
    });

  return [globalView, ...orderedSourceViews];
}

export function filterLeaderboardRows(rows: AggregatedLeaderboardRow[], query: string, minBlocks: number) {
  const normalizedQuery = query.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesQuery = normalizedQuery === "" || row.usernameLower.includes(normalizedQuery);
    const matchesBlocks = row.blocksMined >= minBlocks;
    return matchesQuery && matchesBlocks;
  });
}

export function paginateLeaderboardRows<T>(rows: T[], page: number, pageSize: number) {
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
