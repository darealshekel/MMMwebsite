import spreadsheetSnapshot from "./static-mmm-snapshot.js";

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

function sortRows(rows: AnyRow[]) {
  return [...rows]
    .sort((left, right) => {
      if (Number(right.blocksMined ?? 0) !== Number(left.blocksMined ?? 0)) {
        return Number(right.blocksMined ?? 0) - Number(left.blocksMined ?? 0);
      }
      return String(left.username ?? "").localeCompare(String(right.username ?? ""));
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

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
    playerFlagUrl: playerFlagByUsername.get(String(row.username ?? "").toLowerCase()) ?? null,
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
    hasSpreadsheetTotal: Boolean(source.hasSpreadsheetTotal),
  };
}

export function getStaticPublicSources() {
  return sources
    .map(publicSourceSummary)
    .sort((left: AnySource, right: AnySource) => String(left.displayName ?? "").localeCompare(String(right.displayName ?? "")));
}

function applyLeaderboardFilters(rows: AnyRow[], query: string, minBlocks: number) {
  const normalizedQuery = query.trim().toLowerCase();
  return rows.filter((row) => {
    const username = String(row.username ?? "").toLowerCase();
    const sourceServer = String(row.sourceServer ?? "").toLowerCase();
    return Number(row.blocksMined ?? 0) >= minBlocks
      && (!normalizedQuery || username.includes(normalizedQuery) || sourceServer.includes(normalizedQuery));
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
    const baseRows = sortRows(mainRows);
    const filteredRows = applyLeaderboardFilters(baseRows, query, minBlocks);
    const paginated = paginateRows(filteredRows, page, pageSize);

    return {
      scope: "main",
      title: "Single Players",
      description: mainLeaderboard.description ?? "Spreadsheet-backed totals from the MMM Digs tab.",
      scoreLabel: "Blocks Mined",
      source: null,
      featuredRows: filteredRows.slice(0, 3),
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

  const spreadsheetSourceRows = Array.isArray(spreadsheetSource.rows) ? (spreadsheetSource.rows as AnyRow[]) : [];
  const sourceRows = toLocalSourceRows(spreadsheetSource, spreadsheetSourceRows);
  const filteredRows = applyLeaderboardFilters(sourceRows, query, minBlocks);
  const paginated = paginateRows(filteredRows, page, pageSize);
  const isFiltered = Boolean(query.trim()) || minBlocks > 0;

  return {
    scope: "source",
    title: source.displayName,
    description:
      spreadsheetSource.sourceScope === "private_server_digs"
        ? `${source.displayName} total from Private Server Digs with player rows mapped from Digs.`
        : `${source.displayName} grouped from Digs source/logo entries.`,
    scoreLabel: "Blocks Mined",
    source,
    featuredRows: filteredRows.slice(0, 3),
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
  const dataset = specialLeaderboards[kind];
  if (!dataset) {
    return null;
  }

  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, toInt(url.searchParams.get("pageSize"), 30)));
  const minBlocks = Math.max(0, Number(url.searchParams.get("minBlocks") ?? "0"));
  const query = url.searchParams.get("query") ?? "";
  const datasetRows = Array.isArray(dataset.rows) ? (dataset.rows as AnyRow[]) : [];
  const filteredRows = applyLeaderboardFilters(sortRows(datasetRows), query, minBlocks);
  const paginated = paginateRows(filteredRows, page, pageSize);
  const isFiltered = Boolean(query.trim()) || minBlocks > 0;

  return {
    kind,
    title: dataset.title,
    description: dataset.description,
    scoreLabel: "Blocks Mined",
    featuredRows: filteredRows.slice(0, 3),
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
