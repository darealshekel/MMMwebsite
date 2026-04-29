import spreadsheetSnapshot from "./static-mmm-snapshot.js";
import {
  isHspSource,
  isSspSource,
  specialLeaderboardIconKey,
  specialLeaderboardLabel,
  SSP_SOURCE_LOGO_URL,
  HSP_SOURCE_LOGO_URL,
} from "../../shared/source-classification.js";

type JsonRecord = Record<string, unknown>;
type AnyRow = JsonRecord;
type AnySource = JsonRecord;

const snapshot = spreadsheetSnapshot as JsonRecord;
const sources = Array.isArray(snapshot.sources) ? (snapshot.sources as AnySource[]) : [];
const mainLeaderboard = snapshot.mainLeaderboard && typeof snapshot.mainLeaderboard === "object"
  ? (snapshot.mainLeaderboard as AnySource)
  : {};
const specialLeaderboards = snapshot.specialLeaderboards && typeof snapshot.specialLeaderboards === "object"
  ? (snapshot.specialLeaderboards as Record<string, AnySource>)
  : {};
const sourceBySlug = new Map<string, AnySource>(
  sources.map((source: AnySource) => [String(source.slug ?? ""), source]),
);
const playerFlagByUsername = new Map<string, string | null>();
for (const source of sources) {
  const rows = Array.isArray(source.rows) ? (source.rows as AnyRow[]) : [];
  for (const row of rows) {
    const key = String(row.username ?? "").toLowerCase();
    if (key && !playerFlagByUsername.get(key) && row.playerFlagUrl) {
      playerFlagByUsername.set(key, String(row.playerFlagUrl));
    }
  }
}
const mainRows = Array.isArray(mainLeaderboard.rows) ? (mainLeaderboard.rows as AnyRow[]) : [];
for (const row of mainRows) {
  const key = String(row.username ?? "").toLowerCase();
  if (key && !playerFlagByUsername.get(key) && row.playerFlagUrl) {
    playerFlagByUsername.set(key, String(row.playerFlagUrl));
  }
}

function toInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function displayLeaderboardCopy(value: unknown, fallback = "") {
  return String(value ?? fallback)
    .replace(/\bPrivate Server Digs\b/g, "Server Digs")
    .replace(/\bDigs\b/g, "Player Digs");
}

function sortRows(rows: AnyRow[]): AnyRow[] {
  return [...rows]
    .sort((left, right) => {
      if (Number(right.blocksMined ?? 0) !== Number(left.blocksMined ?? 0)) {
        return Number(right.blocksMined ?? 0) - Number(left.blocksMined ?? 0);
      }
      return String(left.username ?? "").localeCompare(String(right.username ?? ""));
    })
    .map((row, index) => ({ ...row, rank: index + 1 }) as AnyRow);
}

const publicSourcesCache = sources
  .map(publicSourceSummary)
  .sort((left: AnySource, right: AnySource) => String(left.displayName ?? "").localeCompare(String(right.displayName ?? "")));
const sortedMainRowsCache = sortRows(mainRows);
const sourceRowsCache = new Map<string, AnyRow[]>();
const specialRowsCache = new Map<string, AnyRow[]>();
const specialSourceRowsCache = new Map<string, AnyRow[]>();
const ssphspSourceEntriesCache = getStaticSpecialSources("ssp-hsp")
  .map(publicSourceSummary)
  .sort((left: AnySource, right: AnySource) => String(left.displayName ?? "").localeCompare(String(right.displayName ?? "")));

function skinFaceUrl(username: string) {
  return `https://minotar.net/avatar/${encodeURIComponent(username)}/32`;
}

function localPlayerId(username: string) {
  return username.toLowerCase() === "5hekel" ? "local-owner-player" : `local-player:${username.toLowerCase()}`;
}

function toLocalSourceRows(source: AnySource, rows: AnyRow[]) {
  const sortedRows = sortRows(rows.map((row) => ({
    username: row.username,
    blocksMined: Number(row.blocksMined ?? 0),
    lastUpdated: row.lastUpdated,
  })) as AnyRow[]);

  return sortedRows.map((row: AnyRow) => ({
    playerId: localPlayerId(String(row.username ?? "")),
    username: row.username,
    skinFaceUrl: skinFaceUrl(String(row.username ?? "")),
    playerFlagUrl: playerFlagByUsername.get(String(row.username ?? "").toLowerCase()) ?? (row.playerFlagUrl ? String(row.playerFlagUrl) : null),
    lastUpdated: row.lastUpdated,
    blocksMined: row.blocksMined,
    totalDigs: row.blocksMined,
    rank: row.rank,
    sourceServer: source.displayName,
    sourceKey: `${source.slug}:${String(row.username ?? "").toLowerCase()}`,
    sourceCount: 1,
    viewKind: "source",
    sourceId: source.id,
    sourceSlug: source.slug,
    rowKey: `${source.slug}:${String(row.username ?? "").toLowerCase()}`,
  }));
}

function publicSourceSummary(source: AnySource) {
  const rows = Array.isArray(source.rows) ? source.rows : [];
  return {
    id: source.id,
    slug: source.slug,
    displayName: source.displayName,
    sourceType: source.sourceType,
    logoUrl: source.logoUrl ?? null,
    totalBlocks: Number(source.totalBlocks ?? 0),
    isDead: Boolean(source.isDead),
    playerCount: Number(source.playerCount ?? rows.length ?? 0),
    sourceScope: source.sourceScope,
    sourceCategory: source.sourceCategory,
    sourceIdentity: source.sourceIdentity,
    sourceSymbolHash: source.sourceSymbolHash,
    hasSpreadsheetTotal: Boolean(source.hasSpreadsheetTotal),
    needsManualReview: Boolean(source.needsManualReview),
    manualReviewReason: typeof source.manualReviewReason === "string" ? source.manualReviewReason : null,
  };
}

export function getStaticPublicSources() {
  return publicSourcesCache;
}

export function getStaticEditableSources(query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  return [...publicSourcesCache, ...ssphspSourceEntriesCache]
    .filter((source) => {
      if (!normalizedQuery) return true;
      return String(source.displayName ?? "").toLowerCase().includes(normalizedQuery)
        || String(source.slug ?? "").toLowerCase().includes(normalizedQuery)
        || String(source.id ?? "").toLowerCase().includes(normalizedQuery);
    })
    .slice(0, 100);
}

function getStaticSourceRows(sourceSlug: string) {
  const cached = sourceRowsCache.get(sourceSlug);
  if (cached) {
    return cached;
  }

  const source = sourceBySlug.get(sourceSlug);
  if (!source) {
    return null;
  }

  const rows = Array.isArray(source.rows) ? (source.rows as AnyRow[]) : [];
  const localRows = toLocalSourceRows(source, rows);
  sourceRowsCache.set(sourceSlug, localRows);
  return localRows;
}

export function getStaticSpecialSources(kind: string) {
  if (kind === "ssp") {
    return getStaticSpecialSources("ssp-hsp").filter(isSspSource);
  }
  if (kind === "hsp") {
    return getStaticSpecialSources("ssp-hsp").filter(isHspSource);
  }

  const dataset = specialLeaderboards[kind];
  if (!dataset || !Array.isArray(dataset.sources)) {
    return [];
  }
  return dataset.sources as AnySource[];
}

function latestTimestamp(left: unknown, right: unknown) {
  const leftTime = new Date(String(left ?? "")).getTime();
  const rightTime = new Date(String(right ?? "")).getTime();
  if (!Number.isFinite(leftTime)) return String(right ?? left ?? snapshot.generatedAt ?? "");
  if (!Number.isFinite(rightTime)) return String(left ?? right ?? snapshot.generatedAt ?? "");
  return rightTime > leftTime ? String(right ?? "") : String(left ?? "");
}

function buildSpecialRowsFromSources(kind: string, sourceEntries: AnySource[]) {
  const byUsername = new Map<string, AnyRow & { strongestBlocks: number }>();
  const label = specialLeaderboardLabel(kind);
  for (const source of sourceEntries) {
    const rows = Array.isArray(source.rows) ? (source.rows as AnyRow[]) : [];
    for (const row of rows) {
      const username = String(row.username ?? "").trim();
      if (!username) continue;
      const key = username.toLowerCase();
      const blocksMined = Number(row.blocksMined ?? 0);
      const existing = byUsername.get(key) ?? {
        playerId: row.playerId ?? localPlayerId(username),
        username,
        skinFaceUrl: skinFaceUrl(username),
        playerFlagUrl: playerFlagByUsername.get(key) ?? row.playerFlagUrl ?? null,
        lastUpdated: row.lastUpdated ?? snapshot.generatedAt ?? "",
        blocksMined: 0,
        totalDigs: 0,
        rank: 0,
        sourceServer: label,
        sourceKey: `${kind}:${key}`,
        sourceCount: 0,
        viewKind: "global",
        sourceId: `special:${kind}`,
        sourceSlug: kind,
        rowKey: `${kind}:${key}`,
        strongestBlocks: 0,
      };

      existing.blocksMined = Number(existing.blocksMined ?? 0) + blocksMined;
      existing.totalDigs = Number(existing.totalDigs ?? 0) + blocksMined;
      existing.sourceCount = Number(existing.sourceCount ?? 0) + 1;
      existing.lastUpdated = latestTimestamp(existing.lastUpdated, row.lastUpdated);
      if (blocksMined >= Number(existing.strongestBlocks ?? 0)) {
        existing.strongestBlocks = blocksMined;
        existing.sourceServer = String(source.displayName ?? label);
        existing.sourceId = String(source.id ?? `special:${kind}`);
        existing.sourceSlug = String(source.slug ?? kind);
      }
      byUsername.set(key, existing);
    }
  }

  return sortRows([...byUsername.values()].map(({ strongestBlocks, ...row }) => row));
}

function buildClassifiedSpecialDataset(kind: string) {
  const normalizedKind = kind === "hsp" ? "hsp" : kind === "ssp" ? "ssp" : kind;
  const base = specialLeaderboards[normalizedKind] ?? (normalizedKind === "ssp" || normalizedKind === "hsp" ? specialLeaderboards["ssp-hsp"] : null);
  if (!base) {
    return null;
  }
  if (normalizedKind !== "ssp" && normalizedKind !== "hsp") {
    return base;
  }

  const sourceEntries = getStaticSpecialSources(normalizedKind);
  const rows = buildSpecialRowsFromSources(normalizedKind, sourceEntries);
  const iconKey = specialLeaderboardIconKey(normalizedKind);
  const baseIcons = base.icons && typeof base.icons === "object" ? base.icons as JsonRecord : {};
  const fallbackIcon = iconKey === "hsp" ? HSP_SOURCE_LOGO_URL : SSP_SOURCE_LOGO_URL;

  return {
    ...base,
    kind: normalizedKind,
    title: specialLeaderboardLabel(normalizedKind),
    description: normalizedKind === "hsp"
      ? "Ranking for Hardcore Single Player digs."
      : "Ranking for Single Player Survival digs.",
    rows,
    sources: sourceEntries,
    totalBlocks: rows.reduce((sum, row) => sum + Number(row.blocksMined ?? 0), 0),
    playerCount: rows.length,
    icons: {
      [iconKey]: baseIcons[iconKey] ?? fallbackIcon,
    },
  };
}

function findEditableSource(sourceIdOrSlug: string) {
  return sources.find((candidate) => String(candidate.id ?? "") === sourceIdOrSlug || String(candidate.slug ?? "") === sourceIdOrSlug)
    ?? getStaticSpecialSources("ssp-hsp").find((candidate) => String(candidate.id ?? "") === sourceIdOrSlug || String(candidate.slug ?? "") === sourceIdOrSlug)
    ?? null;
}

function getStaticSpecialSourceRows(source: AnySource) {
  const sourceId = String(source.id ?? source.slug ?? "");
  const cached = specialSourceRowsCache.get(sourceId);
  if (cached) {
    return cached;
  }
  const rows = Array.isArray(source.rows) ? (source.rows as AnyRow[]) : [];
  const localRows = toLocalSourceRows(source, rows);
  specialSourceRowsCache.set(sourceId, localRows);
  return localRows;
}

function getStaticSourceRowsForEditableSource(source: AnySource) {
  const sourceId = String(source.id ?? "");
  if (sourceId.startsWith("special:ssp-hsp:")) {
    return getStaticSpecialSourceRows(source);
  }
  return getStaticSourceRows(String(source.slug ?? ""));
}

export function getStaticEditableSourceRows(sourceId: string, query = "") {
  const source = findEditableSource(sourceId);
  if (!source) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const rows = getStaticSourceRowsForEditableSource(source) ?? [];
  return rows
    .filter((row) => !normalizedQuery || String(row.username ?? "").toLowerCase().includes(normalizedQuery))
    .slice(0, 200);
}

export function getStaticEditableSinglePlayers(query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  return sortedMainRowsCache
    .filter((row) => !normalizedQuery || String(row.username ?? "").toLowerCase().includes(normalizedQuery))
    .slice(0, 200);
}

export function getStaticEditableSinglePlayerSourceRows(playerId: string, query = "") {
  const normalizedPlayerId = playerId.trim().toLowerCase();
  const player = sortedMainRowsCache.find((row) => String(row.playerId ?? "").toLowerCase() === normalizedPlayerId);
  const username = String(player?.username ?? normalizedPlayerId.replace(/^sheet:/, "")).trim();
  const usernameSlug = username.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!usernameSlug) {
    return [];
  }

  return [...sources, ...getStaticSpecialSources("ssp-hsp")]
    .flatMap((source) => {
      const sourceSlug = String(source.slug ?? "");
      const sourceRows = getStaticSourceRowsForEditableSource(source) ?? [];
      const row = sourceRows.find((entry) => String(entry.username ?? "").toLowerCase() === usernameSlug);
      if (!row) {
        return [];
      }

      const sourceName = String(source.displayName ?? "Unknown Source");
      if (normalizedQuery && !sourceName.toLowerCase().includes(normalizedQuery) && !sourceSlug.toLowerCase().includes(normalizedQuery)) {
        return [];
      }
      const rowRecord = row as JsonRecord;

      return [{
        sourceId: String(source.id ?? sourceSlug),
        sourceSlug,
        sourceName,
        logoUrl: source.logoUrl ?? null,
        playerId: String(row.playerId ?? localPlayerId(String(row.username ?? username))),
        username: String(row.username ?? username),
        blocksMined: Number(row.blocksMined ?? 0),
        rank: Number(row.rank ?? 0),
        lastUpdated: String(row.lastUpdated ?? player?.lastUpdated ?? snapshot.generatedAt ?? ""),
        needsManualReview: Boolean(source.needsManualReview || rowRecord.needsManualReview),
      }];
    })
    .sort((left, right) => Number(right.blocksMined ?? 0) - Number(left.blocksMined ?? 0))
    .slice(0, 200);
}

export function getStaticSubmitSourcesForUsername(username: string) {
  const usernameSlug = username.trim().toLowerCase();
  if (!usernameSlug) {
    return [];
  }

  const sourceRows = [...sources, ...getStaticSpecialSources("ssp-hsp")].flatMap((source) => {
    const sourceSlug = String(source.slug ?? "");
    const rows = getStaticSourceRowsForEditableSource(source) ?? [];
    const row = rows.find((entry) => String(entry.username ?? "").toLowerCase() === usernameSlug);
    if (!row) {
      return [];
    }

    return [{
      sourceId: String(source.id ?? sourceSlug),
      sourceSlug,
      sourceName: String(source.displayName ?? "Unknown Source"),
      sourceType: String(source.sourceType ?? "server"),
      sourceScope: String(source.sourceScope ?? ""),
      logoUrl: source.logoUrl ? String(source.logoUrl) : null,
      currentBlocks: Number(row.blocksMined ?? 0),
      rank: Number(row.rank ?? 0),
      lastUpdated: String(row.lastUpdated ?? snapshot.generatedAt ?? ""),
    }];
  });

  return sourceRows.sort((left, right) => {
    const delta = Number(right.currentBlocks ?? 0) - Number(left.currentBlocks ?? 0);
    if (delta !== 0) return delta;
    return left.sourceName.localeCompare(right.sourceName);
  });
}

function getStaticSpecialRows(kind: string) {
  const cached = specialRowsCache.get(kind);
  if (cached) {
    return cached;
  }

  const dataset = buildClassifiedSpecialDataset(kind);
  if (!dataset) {
    return null;
  }

  const rows = Array.isArray(dataset.rows) ? (dataset.rows as AnyRow[]) : [];
  const sortedRows = sortRows(rows);
  specialRowsCache.set(kind, sortedRows);
  return sortedRows;
}

export function getStaticDashboardPlayerData(username: string) {
  const slug = username.trim().toLowerCase();
  if (!slug) {
    return null;
  }

  const mainPlayer = sortedMainRowsCache.find((row) => String(row.username ?? "").toLowerCase() === slug) ?? null;
  const servers = [...sources, ...getStaticSpecialSources("ssp-hsp")].flatMap((source) => {
    const sourceSlug = String(source.slug ?? "");
    const sourceRows = getStaticSourceRowsForEditableSource(source) ?? [];
    const row = sourceRows.find((entry) => String(entry.username ?? "").toLowerCase() === slug);
    return row
      ? [{
          id: String(source.id ?? sourceSlug),
          displayName: String(source.displayName ?? "Unknown Source"),
          totalBlocks: Number(row.blocksMined ?? 0),
          rank: Number(row.rank ?? 0),
          lastUpdated: String(row.lastUpdated ?? mainPlayer?.lastUpdated ?? snapshot.generatedAt ?? ""),
        }]
      : [];
  });

  if (!mainPlayer && servers.length === 0) {
    return null;
  }

  const totalBlocks = Number(mainPlayer?.blocksMined ?? servers.reduce((sum, server) => sum + server.totalBlocks, 0));
  const resolvedUsername = String(mainPlayer?.username ?? username);
  const lastUpdated = String(mainPlayer?.lastUpdated ?? servers[0]?.lastUpdated ?? snapshot.generatedAt ?? "");

  return {
    playerId: String(mainPlayer?.playerId ?? localPlayerId(resolvedUsername)),
    username: resolvedUsername,
    totalBlocks,
    rank: mainPlayer ? Number(mainPlayer.rank ?? 0) : null,
    sourceServer: String(mainPlayer?.sourceServer ?? servers[0]?.displayName ?? ""),
    sourceCount: Number(mainPlayer?.sourceCount ?? servers.length),
    lastUpdated,
    servers,
  };
}

function applyLeaderboardFilters(rows: AnyRow[], query: string, minBlocks: number) {
  const normalizedQuery = query.trim().toLowerCase();
  return rows.filter((row) => {
    const username = String(row.username ?? "").toLowerCase();
    return Number(row.blocksMined ?? 0) >= minBlocks
      && (!normalizedQuery || username.includes(normalizedQuery));
  });
}

function paginateRows(rows: AnyRow[], page: number, pageSize: number) {
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageSize,
    totalRows,
    totalPages,
    rows: rows.slice(start, start + pageSize),
  };
}

export function buildStaticLeaderboardResponse(url: URL) {
  const sourceSlug = url.searchParams.get("source");
  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, toInt(url.searchParams.get("pageSize"), 30)));
  const minBlocks = Math.max(0, Number(url.searchParams.get("minBlocks") ?? "0"));
  const query = url.searchParams.get("query") ?? "";
  const publicSources = getStaticPublicSources();

  if (!sourceSlug) {
    const baseRows = sortedMainRowsCache;
    const filteredRows = applyLeaderboardFilters(baseRows, query, minBlocks);
    const paginated = paginateRows(filteredRows, page, pageSize);

    return {
      scope: "main",
      title: "Single Players",
      description: displayLeaderboardCopy(mainLeaderboard.description, "Spreadsheet-backed totals from the MMM Player Digs tab."),
      scoreLabel: "Blocks Mined",
      source: null,
      featuredRows: baseRows.slice(0, 3),
      rows: paginated.rows,
      page: paginated.page,
      pageSize: paginated.pageSize,
      totalRows: paginated.totalRows,
      totalPages: paginated.totalPages,
      totalBlocks: filteredRows.reduce((sum: number, row: AnyRow) => sum + Number(row.blocksMined ?? 0), 0),
      playerCount: filteredRows.length,
      highlightedPlayer: "5hekel",
      publicSources,
    };
  }

  const source = publicSources.find((candidate: AnySource) => candidate.slug === sourceSlug);
  const spreadsheetSource = sourceBySlug.get(sourceSlug);
  if (!source || !spreadsheetSource) {
    return null;
  }

  const sourceRows = getStaticSourceRows(sourceSlug) ?? [];
  const filteredRows = applyLeaderboardFilters(sourceRows, query, minBlocks);
  const paginated = paginateRows(filteredRows, page, pageSize);
  const isFiltered = Boolean(query.trim()) || minBlocks > 0;

  return {
    scope: "source",
    title: source.displayName,
    description:
      spreadsheetSource.sourceScope === "private_server_digs"
        ? `${source.displayName} total from Server Digs with player rows mapped from Player Digs.`
        : `${source.displayName} grouped from Player Digs source/logo entries.`,
    scoreLabel: "Blocks Mined",
    source,
    featuredRows: sourceRows.slice(0, 3),
    rows: paginated.rows,
    page: paginated.page,
    pageSize: paginated.pageSize,
    totalRows: paginated.totalRows,
    totalPages: paginated.totalPages,
    totalBlocks: isFiltered
      ? filteredRows.reduce((sum: number, row: AnyRow) => sum + Number(row.blocksMined ?? 0), 0)
      : Number(source.totalBlocks ?? 0),
    playerCount: isFiltered ? filteredRows.length : Number(spreadsheetSource.playerCount ?? filteredRows.length),
    highlightedPlayer: "5hekel",
    publicSources,
  };
}

export function buildStaticSpecialLeaderboardResponse(url: URL) {
  const kind = url.searchParams.get("kind") ?? "";
  const dataset = buildClassifiedSpecialDataset(kind);
  if (!dataset) {
    return null;
  }

  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, toInt(url.searchParams.get("pageSize"), 30)));
  const minBlocks = Math.max(0, Number(url.searchParams.get("minBlocks") ?? "0"));
  const query = url.searchParams.get("query") ?? "";
  const baseRows = getStaticSpecialRows(kind) ?? [];
  const filteredRows = applyLeaderboardFilters(baseRows, query, minBlocks);
  const paginated = paginateRows(filteredRows, page, pageSize);
  const isFiltered = Boolean(query.trim()) || minBlocks > 0;

  return {
    kind,
    title: dataset.title,
    description: dataset.description,
    scoreLabel: "Blocks Mined",
    featuredRows: baseRows.slice(0, 3),
    rows: paginated.rows,
    page: paginated.page,
    pageSize: paginated.pageSize,
    totalRows: paginated.totalRows,
    totalPages: paginated.totalPages,
    totalBlocks: isFiltered
      ? filteredRows.reduce((sum: number, row: AnyRow) => sum + Number(row.blocksMined ?? 0), 0)
      : Number(dataset.totalBlocks ?? 0),
    playerCount: isFiltered ? filteredRows.length : Number(dataset.playerCount ?? filteredRows.length),
    highlightedPlayer: "5hekel",
    icons: dataset.icons ?? null,
  };
}

function deriveBio(player: AnyRow, serverCount: number) {
  if (Number(player.rank ?? 0) === 1) {
    return "Veteran strip-miner. Lives in the deep slate layers. Never refuses a diamond run.";
  }
  if (serverCount > 1) {
    return `Cross-source grinder with ${serverCount} tracked places and a habit of pushing totals into absurd territory.`;
  }
  return `${String(player.username ?? "Player")} keeps a disciplined mining schedule and shows up on the board with real hand-mined numbers.`;
}

function deriveFavoriteBlock(player: AnyRow) {
  const options = ["DEEPSLATE", "IRON ORE", "REDSTONE", "EMERALD", "QUARTZ", "ANCIENT DEBRIS"];
  const seed = String(player.username ?? "").length + Number(player.rank ?? 0);
  return options[seed % options.length];
}

export function buildStaticPlayerDetailResponse(url: URL) {
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  if (!slug) {
    return null;
  }

  const mainPlayer = sortedMainRowsCache.find((row) => String(row.username ?? "").toLowerCase() === slug) ?? null;
  const servers = [...sources, ...getStaticSpecialSources("ssp-hsp")].flatMap((source) => {
    const sourceSlug = String(source.slug ?? "");
    const sourceRows = getStaticSourceRowsForEditableSource(source) ?? [];
    const row = sourceRows.find((entry) => String(entry.username ?? "").toLowerCase() === slug);
    return row
      ? [{
          sourceId: String(source.id ?? sourceSlug),
          playerId: String(row.playerId ?? ""),
          server: String(source.displayName ?? ""),
          logoUrl: source.logoUrl ? String(source.logoUrl) : null,
          blocks: Number(row.blocksMined ?? 0),
          rank: Number(row.rank ?? 0),
          joined: "2024",
        }]
      : [];
  });

  const sourcePlayer: AnyRow | null = mainPlayer
    ? null
    : servers.length
      ? {
          username: slug,
          rank: servers[0]?.rank ?? 0,
          blocksMined: servers.reduce((sum, server) => sum + server.blocks, 0),
          sourceCount: servers.length,
        }
      : null;
  const player = mainPlayer ?? sourcePlayer;
  if (!player) {
    return null;
  }

  const username = String(player.username ?? slug);
  const aggregateBlocks = Number(mainPlayer?.blocksMined ?? servers.reduce((sum, server) => sum + server.blocks, 0));

  return {
    rank: Number(player.rank ?? 0),
    slug: username.toLowerCase(),
    name: username,
    playerFlagUrl: playerFlagByUsername.get(username.toLowerCase()) ?? (player.playerFlagUrl ? String(player.playerFlagUrl) : null),
    blocksNum: aggregateBlocks,
    avatarUrl: `https://nmsr.nickac.dev/fullbody/${encodeURIComponent(username)}`,
    bio: deriveBio(player, servers.length || Number(player.sourceCount ?? 0)),
    joined: "APR 2024",
    favoriteBlock: deriveFavoriteBlock(player),
    places: servers.length || Number(player.sourceCount ?? 0),
    servers,
    activity: [],
    sessions: [],
  };
}
