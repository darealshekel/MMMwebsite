// ✅ TYPES

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
  sourceKind: "world"; // 🔥 force uniform
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

// ✅ HELPERS

function normalizeUsername(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toTimestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function assignRanks(rows: any[]) {
  let prevScore: number | null = null;
  let prevRank = 0;

  return rows.map((row, i) => {
    const rank = prevScore !== null && row.blocksMined === prevScore ? prevRank : i + 1;
    prevScore = row.blocksMined;
    prevRank = rank;
    return { ...row, rank };
  });
}

function chooseBetterUsername(current: string, candidate: string) {
  if (!current) return candidate;
  if (!candidate) return current;
  if (current.toLowerCase() === current && candidate.toLowerCase() !== candidate) {
    return candidate;
  }
  return current.length >= candidate.length ? current : candidate;
}

// ✅ MAIN AGGREGATION

export function aggregateLeaderboardViews(
  contributions: LeaderboardContribution[],
  sourceTotals: ReadonlyMap<string, LeaderboardSourceTotals> = new Map()
): AggregatedLeaderboardView[] {
  const players = new Map<string, any>();

  for (const c of contributions) {
    if (!c.username || c.blocksMined <= 0) continue;

    const key =
      c.playerId ||
      c.minecraftUuidHash ||
      normalizeUsername(c.username);

    const existing = players.get(key) ?? {
      username: c.username,
      usernameLower: normalizeUsername(c.username),
      playerId: c.playerId ?? null,
      sources: new Map(),
    };

    existing.username = chooseBetterUsername(existing.username, c.username);

    const prev = existing.sources.get(c.sourceKey);

    if (
      !prev ||
      c.blocksMined > prev.blocksMined ||
      (c.blocksMined === prev.blocksMined &&
        toTimestamp(c.lastUpdated) > toTimestamp(prev.lastUpdated))
    ) {
      existing.sources.set(c.sourceKey, c);
    }

    players.set(key, existing);
  }

  // ✅ GLOBAL VIEW

  const globalRows = Array.from(players.values())
    .map((p) => {
      const sources = Array.from(p.sources.values());

      const total = sources.reduce((sum, s) => sum + s.blocksMined, 0);

      const latest =
        sources
          .map((s) => s.lastUpdated)
          .sort((a, b) => toTimestamp(b) - toTimestamp(a))[0] ?? new Date(0).toISOString();

      return {
        playerId: p.playerId,
        username: p.username,
        usernameLower: p.usernameLower,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(p.username)}/48`,
        lastUpdated: latest,
        blocksMined: total,
        totalDigs: total,
        sourceServer: `${sources.length} sources`,
        sourceKey: "global",
        sourceCount: sources.length,
        viewKind: "global",
      };
    })
    .sort((a, b) => b.blocksMined - a.blocksMined);

  const globalView: AggregatedLeaderboardView = {
    key: "global",
    label: "Main Leaderboard",
    description: "Totals across all sources",
    kind: "global",
    playerCount: globalRows.length,
    totalBlocks: globalRows.reduce((sum, r) => sum + r.blocksMined, 0),
    rows: assignRanks(globalRows),
  };

  // ✅ SOURCE VIEWS

  const sourceMap = new Map<string, AggregatedLeaderboardView>();

  for (const player of players.values()) {
    for (const s of player.sources.values()) {
      if (s.includeSourceView === false) continue;

      const view =
        sourceMap.get(s.sourceKey) ?? {
          key: s.sourceKey,
          label: s.sourceLabel,
          description: `Totals from ${s.sourceLabel}`,
          kind: "source",
          playerCount: 0,
          totalBlocks: 0,
          rows: [],
        };

      view.rows.push({
        playerId: player.playerId,
        username: player.username,
        usernameLower: player.usernameLower,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(player.username)}/48`,
        lastUpdated: s.lastUpdated,
        blocksMined: s.blocksMined,
        totalDigs: s.blocksMined,
        rank: 0,
        sourceServer: s.sourceLabel,
        sourceKey: s.sourceKey,
        sourceCount: 1,
        viewKind: "source",
      });

      sourceMap.set(s.sourceKey, view);
    }
  }

  const sourceViews = Array.from(sourceMap.values()).map((view) => {
    const sorted = view.rows.sort((a, b) => b.blocksMined - a.blocksMined);

    return {
      ...view,
      playerCount: sorted.length,
      totalBlocks:
        sourceTotals.get(view.key)?.totalBlocks ??
        sorted.reduce((sum, r) => sum + r.blocksMined, 0),
      rows: assignRanks(sorted),
    };
  });

  return [globalView, ...sourceViews];
}

// ✅ FILTER + PAGINATION (MISSING EXPORTS FIX)

export function filterLeaderboardRows(rows: AggregatedLeaderboardRow[], query: string, minBlocks: number) {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (r) => (q === "" || r.usernameLower.includes(q)) && r.blocksMined >= minBlocks
  );
}

export function paginateLeaderboardRows<T>(rows: T[], page: number, pageSize: number) {
  const size = Math.max(1, Math.min(pageSize, 100));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.max(1, Math.min(page, pages));
  const start = (current - 1) * size;

  return {
    page: current,
    pageSize: size,
    totalRows: total,
    totalPages: pages,
    rows: rows.slice(start, start + size),
  };
}
