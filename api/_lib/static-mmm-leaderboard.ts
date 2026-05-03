import spreadsheetSnapshot from "./static-mmm-snapshot.js";
import {
  isHspSource,
  isSspSource,
  specialLeaderboardIconKey,
  specialLeaderboardLabel,
  shouldShowInPrivateServerDigs,
  SSP_SOURCE_LOGO_URL,
  HSP_SOURCE_LOGO_URL,
} from "../../shared/source-classification.js";
import { buildNmsrFaceUrl, buildNmsrFullBodyUrl } from "../../shared/player-avatar.js";
import { canonicalPlayerName } from "../../shared/player-identity.js";
import { getSourceStats } from "./source-stats.js";

type JsonRecord = Record<string, unknown>;
type AnyRow = JsonRecord;
type AnySource = JsonRecord;

const snapshot = spreadsheetSnapshot as JsonRecord;
const rawSources = Array.isArray(snapshot.sources) ? (snapshot.sources as AnySource[]) : [];

const KHAOS_TECH_ROWS = [
  ["c0ozy", 200_000],
  ["D1ncan", 158_456],
  ["RockDiagram1215", 131_469],
  ["Itz_HyperBoy", 61_590],
  ["Blue706", 58_753],
  ["mcgav99", 33_277],
  ["adryboy0713", 5_481],
  ["AzureMC", 3_239],
  ["Ragdoll_Willy", 2_951],
  ["Anonym_26893", 1_219],
  ["DemogorganYT", 540],
  ["Godzimc", 86],
  ["panda712", 46],
  ["nan_nand", 30],
] as const;

function staticSourceRow(username: string, blocksMined: number, source: AnySource): AnyRow {
  return {
    playerId: `sheet:${canonicalPlayerName(username)}`,
    username,
    skinFaceUrl: buildNmsrFaceUrl(username),
    playerFlagUrl: null,
    lastUpdated: String(snapshot.generatedAt ?? ""),
    blocksMined,
    totalDigs: blocksMined,
    rank: 0,
    sourceServer: String(source.displayName ?? ""),
    sourceKey: `${String(source.slug ?? "")}:${username.toLowerCase()}`,
    sourceCount: 1,
    viewKind: "source",
    sourceId: source.id,
    sourceSlug: source.slug,
    rowKey: `${String(source.slug ?? "")}:${username.toLowerCase()}`,
  };
}

function applyStaticSourceCorrections(source: AnySource): AnySource {
  const slug = String(source.slug ?? "");

  if (slug === "kh-ostech") {
    return {
      ...source,
      totalBlocks: KHAOS_TECH_ROWS.reduce((sum, [, blocks]) => sum + blocks, 0),
      rows: KHAOS_TECH_ROWS.map(([username, blocksMined]) => staticSourceRow(username, blocksMined, source)),
    };
  }

  if (slug === "backstage-smp") {
    const rows = (Array.isArray(source.rows) ? source.rows as AnyRow[] : [])
      .filter((row) => canonicalPlayerName(row.username) !== "douglasgordo")
      .map((row) => canonicalPlayerName(row.username) === "eyome" ? { ...row, blocksMined: 24_000_000, totalDigs: 24_000_000 } : row);

    return {
      ...source,
      logoUrl: null,
      totalBlocks: 38_901_192,
      rows,
    };
  }

  return source;
}

const sources = rawSources.map(applyStaticSourceCorrections);
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

function normalizedProfileSourceLabel(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function compactProfileSourceLabel(value: unknown) {
  return normalizedProfileSourceLabel(value).replace(/[^a-z0-9]/g, "");
}

function isNarutakuSmpProfileSource(source: AnyRow) {
  return compactProfileSourceLabel(source.server ?? source.displayName ?? source.sourceSlug ?? source.slug) === "narutakusmp";
}

function isUnlabeledProfileWorld(source: AnyRow) {
  const label = normalizedProfileSourceLabel(source.server ?? source.displayName ?? source.sourceName);
  const slug = normalizedProfileSourceLabel(source.sourceSlug ?? source.slug);
  return /^unlabel(?:ed|led) world(?:\s*(?:\(\d+\)|\d+))?$/.test(label)
    || /^unlabled world(?:\s*(?:\(\d+\)|\d+))?$/.test(label)
    || /^ssp-hsp-.+-unlabel(?:ed|led)-world(?:-\d+)?$/.test(slug)
    || /^ssp-hsp-.+-unlabled-world(?:-\d+)?$/.test(slug);
}

function normalizeNarutakuProfileSource(source: AnyRow) {
  if (!isNarutakuSmpProfileSource(source)) {
    return source;
  }

  return {
    ...source,
    server: "Narutaku SMP",
    sourceSlug: "narutaku-smp",
    sourceType: "server",
    sourceCategory: "server",
    sourceScope: "private_server_digs",
  };
}

function normalizeNarutakuProfileSources(rows: AnyRow[]) {
  const normalized = rows.map(normalizeNarutakuProfileSource);
  const hasNarutakuSmp = normalized.some(isNarutakuSmpProfileSource);
  if (!hasNarutakuSmp) {
    return { rows: normalized, removed: false, hasNarutakuSmp };
  }

  const filtered = normalized.filter((row) => !isUnlabeledProfileWorld(row));
  return { rows: filtered, removed: filtered.length !== normalized.length, hasNarutakuSmp };
}

function sortRows(rows: AnyRow[]): AnyRow[] {
  return [...rows]
    .sort((left, right) => {
      if (Number(right.blocksMined ?? 0) !== Number(left.blocksMined ?? 0)) {
        return Number(right.blocksMined ?? 0) - Number(left.blocksMined ?? 0);
      }
      return String(left.username ?? "").localeCompare(String(right.username ?? ""));
    })
    .map((row, index) => ({
      ...row,
      skinFaceUrl: buildNmsrFaceUrl(String(row.username ?? "")),
      rank: index + 1,
    }) as AnyRow);
}

function sourceRowsAggregateByPlayer() {
  const aggregates = new Map<string, { totalBlocks: number; sourceCount: number; sourceServer: string; lastUpdated: string }>();
  for (const source of [...sources, ...getStaticSpecialSources("ssp-hsp")]) {
    const rows = Array.isArray(source.rows) ? (source.rows as AnyRow[]) : [];
    for (const row of rows) {
      const username = String(row.username ?? "").trim();
      const key = canonicalPlayerName(username);
      if (!key) continue;
      const existing = aggregates.get(key);
      aggregates.set(key, {
        totalBlocks: (existing?.totalBlocks ?? 0) + Number(row.blocksMined ?? 0),
        sourceCount: (existing?.sourceCount ?? 0) + 1,
        sourceServer: existing?.sourceServer ?? String(source.displayName ?? ""),
        lastUpdated: latestTimestamp(existing?.lastUpdated, row.lastUpdated),
      });
    }
  }
  return aggregates;
}

function mergeDuplicateMainRows(rows: AnyRow[]) {
  const aggregates = sourceRowsAggregateByPlayer();
  const grouped = new Map<string, AnyRow[]>();
  for (const row of rows) {
    const key = canonicalPlayerName(row.username);
    if (!key) continue;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  return rows.flatMap((row) => {
    const key = canonicalPlayerName(row.username);
    if (!key) return [row];
    const group = grouped.get(key) ?? [row];
    if (group[0] !== row) return [];

    const strongestRow = group.reduce((best, candidate) => {
      const delta = Number(candidate.blocksMined ?? 0) - Number(best.blocksMined ?? 0);
      if (delta !== 0) return delta > 0 ? candidate : best;
      return Number(candidate.sourceCount ?? 0) > Number(best.sourceCount ?? 0) ? candidate : best;
    }, group[0]);
    const aggregate = aggregates.get(key);
    const aggregateBlocks = Number(aggregate?.totalBlocks ?? 0);
    const strongestBlocks = Number(strongestRow.blocksMined ?? 0);
    const useAggregate = aggregateBlocks > strongestBlocks;
    const username = String(strongestRow.username ?? row.username ?? "");
    const blocksMined = useAggregate ? aggregateBlocks : strongestBlocks;

    return [{
      ...strongestRow,
      username,
      skinFaceUrl: buildNmsrFaceUrl(username),
      blocksMined,
      totalDigs: blocksMined,
      sourceCount: useAggregate ? aggregate?.sourceCount ?? strongestRow.sourceCount : strongestRow.sourceCount,
      sourceServer: useAggregate ? aggregate?.sourceServer ?? strongestRow.sourceServer : strongestRow.sourceServer,
      lastUpdated: useAggregate ? aggregate?.lastUpdated ?? strongestRow.lastUpdated : strongestRow.lastUpdated,
      rowKey: `global:${key}`,
    }];
  });
}

const publicSourcesCache = sources
  .map(publicSourceSummary)
  .sort((left: AnySource, right: AnySource) => String(left.displayName ?? "").localeCompare(String(right.displayName ?? "")));
const sortedMainRowsCache = sortRows(mergeDuplicateMainRows(mainRows));
const sourceRowsCache = new Map<string, AnyRow[]>();
const specialRowsCache = new Map<string, AnyRow[]>();
const specialSourceRowsCache = new Map<string, AnyRow[]>();
const ssphspSourceEntriesCache = getStaticSpecialSources("ssp-hsp")
  .map(publicSourceSummary)
  .sort((left: AnySource, right: AnySource) => String(left.displayName ?? "").localeCompare(String(right.displayName ?? "")));

function skinFaceUrl(username: string) {
  return buildNmsrFaceUrl(username);
}

function fullBodyUrl(username: string) {
  return buildNmsrFullBodyUrl(username);
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
  const stats = getSourceStats(source);
  return {
    id: source.id,
    slug: source.slug,
    displayName: source.displayName,
    sourceType: source.sourceType,
    logoUrl: source.logoUrl ?? null,
    totalBlocks: stats.totalBlocks,
    isDead: Boolean(source.isDead),
    playerCount: stats.playerCount,
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

export function getStaticLandingTopSources() {
  return sources
    .map(publicSourceSummary)
    .filter(shouldShowInPrivateServerDigs)
    .sort((left: AnySource, right: AnySource) => {
      const blocksDelta = Number(right.totalBlocks ?? 0) - Number(left.totalBlocks ?? 0);
      return blocksDelta || String(left.displayName ?? "").localeCompare(String(right.displayName ?? ""));
    })
    .slice(0, 3);
}

export function getStaticMainLeaderboardRows() {
  return sortedMainRowsCache;
}

export function findStaticMainLeaderboardRowForPlayer(username: string, playerId?: string | null) {
  const normalizedUsername = canonicalPlayerName(username);
  const normalizedPlayerId = String(playerId ?? "").trim().toLowerCase();
  return sortedMainRowsCache.find((row) => {
    const rowPlayerId = String(row.playerId ?? "").trim().toLowerCase();
    return Boolean(normalizedPlayerId && rowPlayerId === normalizedPlayerId)
      || canonicalPlayerName(row.username) === normalizedUsername;
  }) ?? null;
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

export function getStaticSourceLeaderboardRows(sourceSlug: string) {
  return getStaticSourceRows(sourceSlug);
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

export function getStaticSpecialLeaderboardRows(kind: string) {
  const dataset = buildClassifiedSpecialDataset(kind);
  return dataset && Array.isArray(dataset.rows) ? dataset.rows as AnyRow[] : [];
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
  const slug = canonicalPlayerName(username);
  if (!slug) {
    return null;
  }

  const mainPlayer = findStaticMainLeaderboardRowForPlayer(slug);
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
  const sourceStats = getSourceStats(spreadsheetSource);
  const filteredStats = getSourceStats(filteredRows);

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
    totalBlocks: isFiltered ? filteredStats.rowTotalBlocks : sourceStats.totalBlocks,
    playerCount: isFiltered ? filteredStats.playerCount : sourceStats.playerCount,
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
  const slug = canonicalPlayerName(url.searchParams.get("slug") ?? "");
  if (!slug) {
    return null;
  }

  const mainPlayer = findStaticMainLeaderboardRowForPlayer(slug);
  const rawServers = [...sources, ...getStaticSpecialSources("ssp-hsp")].flatMap((source) => {
    const sourceSlug = String(source.slug ?? "");
    const sourceRows = getStaticSourceRowsForEditableSource(source) ?? [];
    const row = sourceRows.find((entry) => String(entry.username ?? "").toLowerCase() === slug);
    return row
      ? [{
          sourceId: String(source.id ?? sourceSlug),
          sourceSlug,
          playerId: String(row.playerId ?? ""),
          server: String(source.displayName ?? ""),
          logoUrl: source.logoUrl ? String(source.logoUrl) : null,
          sourceType: String(source.sourceType ?? ""),
          sourceCategory: String(source.sourceCategory ?? ""),
          sourceScope: String(source.sourceScope ?? ""),
          blocks: Number(row.blocksMined ?? 0),
          rank: Number(row.rank ?? 0),
          joined: "2024",
        }]
      : [];
  });
  const normalizedServerResult = normalizeNarutakuProfileSources(rawServers);
  const servers = normalizedServerResult.rows;

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
  const serverBlocks = servers.reduce((sum, server) => sum + Number(server.blocks ?? 0), 0);
  const aggregateBlocks = Number(
    normalizedServerResult.hasNarutakuSmp || normalizedServerResult.removed
      ? serverBlocks
      : mainPlayer?.blocksMined ?? serverBlocks,
  );

  return {
    rank: Number(player.rank ?? 0),
    slug: username.toLowerCase(),
    name: username,
    playerFlagUrl: playerFlagByUsername.get(username.toLowerCase()) ?? (player.playerFlagUrl ? String(player.playerFlagUrl) : null),
    blocksNum: aggregateBlocks,
    avatarUrl: fullBodyUrl(username),
    bio: deriveBio(player, servers.length || Number(player.sourceCount ?? 0)),
    joined: "APR 2024",
    favoriteBlock: deriveFavoriteBlock(player),
    places: servers.length || Number(player.sourceCount ?? 0),
    servers,
    activity: [],
    sessions: [],
  };
}
