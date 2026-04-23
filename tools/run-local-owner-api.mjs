import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import { createLocalAdminState } from "./local-admin-state.mjs";
import { isManagementRole, isOwnerRole } from "../shared/admin-management.js";

const PORT = Number(process.env.LOCAL_OWNER_API_PORT || 4176);
const NOW = Date.now();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPREADSHEET_SNAPSHOT_PATH = path.resolve(__dirname, "../src/generated/mmm-spreadsheet-source-data.json");

const viewer = {
  userId: "local-owner",
  username: "5hekel",
  avatarUrl: "https://minotar.net/avatar/5hekel/64",
  provider: "local-dev",
  role: "owner",
  isAdmin: true,
};

function isoHoursAgo(hoursAgo) {
  return new Date(NOW - hoursAgo * 60 * 60 * 1000).toISOString();
}

function skinFaceUrl(username) {
  return `https://minotar.net/avatar/${encodeURIComponent(username)}/32`;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function loadSpreadsheetSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(SPREADSHEET_SNAPSHOT_PATH, "utf8"));
  } catch (error) {
    console.warn("[local-owner-api] unable to load spreadsheet snapshot:", error instanceof Error ? error.message : error);
    return null;
  }
}

const spreadsheetSnapshot = loadSpreadsheetSnapshot();

const legacyPublicSources = [
  { id: "src-aeternum", slug: "aeternum", displayName: "Aeternum", sourceType: "server", logoUrl: null, totalBlocks: 0, playerCount: 0, sourceScope: "legacy_seed" },
  { id: "src-redshaft", slug: "redshaft", displayName: "Redshaft", sourceType: "server", logoUrl: null, totalBlocks: 0, playerCount: 0, sourceScope: "legacy_seed" },
  { id: "src-obsidian-hollows", slug: "obsidian-hollows", displayName: "Obsidian Hollows", sourceType: "server", logoUrl: null, totalBlocks: 0, playerCount: 0, sourceScope: "legacy_seed" },
  { id: "src-stonegarden", slug: "stonegarden", displayName: "Stonegarden", sourceType: "server", logoUrl: null, totalBlocks: 0, playerCount: 0, sourceScope: "legacy_seed" },
  { id: "src-cinder-pit", slug: "cinder-pit", displayName: "Cinder Pit", sourceType: "server", logoUrl: null, totalBlocks: 0, playerCount: 0, sourceScope: "legacy_seed" },
];

const featuredNames = [
  "LukeEm",
  "5hekel",
  "Duartyh",
  "SheronMan",
  "Smugless",
  "justlukie",
  "OdeNick",
  "Akatsuki_202",
  "MineGod42",
  "QuartzRogue",
  "BasaltPilot",
  "Netherracker",
];

const generatedNames = [
  "TunnelRiot","RedVein","DepthShift","ObsidianJoe","StoneAudit","PickPulse","GridBreaker","OreCanon",
  "BlockLedger","DustTheory","GrindSaint","DeepRail","VoidMiner","CrimsonPick","ChunkProof","Blackrock",
  "DigMercy","HardenedOre","MagmaCount","TunnelChief","Excavax","IronWitness","BasementVein","SlateCrow",
  "PitSignal","CoreWitness","DigMarshal","SurveyPick","MineStatic","GravelKing","ScarletDust","HardModeOre",
  "ProofRunner","BedrockTape","ShiftMiner","VeinHammer","Underkeep","NightTunnel","PickDiscipline","StoneIndex",
  "MineCourier","RankRunner","ZeroChunk","DeepslateLab","QuartzEngine","OldPick","IronPace","BlazeDrill",
  "LavaLedger","DustProtocol","ServerCore","BlackPit","TunnelWarden","MineVector","OreReceipt","GridTorch",
];

function createLegacySourceEntries() {
  const entries = [];
  const baseRows = [
    ["Aeternum", "LukeEm", 78195897, 6],
    ["Aeternum", "5hekel", 10437763, 3],
    ["Aeternum", "Duartyh", 9221450, 5],
    ["Aeternum", "SheronMan", 8742102, 7],
    ["Aeternum", "Smugless", 7324400, 4],
    ["Aeternum", "justlukie", 6891044, 2],
    ["Redshaft", "OdeNick", 18672340, 11],
    ["Redshaft", "Akatsuki_202", 15440980, 8],
    ["Redshaft", "QuartzRogue", 9881440, 10],
    ["Obsidian Hollows", "MineGod42", 21440000, 14],
    ["Obsidian Hollows", "Netherracker", 12550771, 12],
    ["Stonegarden", "BasaltPilot", 16990115, 9],
    ["Stonegarden", "CrimsonPick", 11880321, 15],
    ["Cinder Pit", "BlockLedger", 14355000, 13],
    ["Cinder Pit", "GrindSaint", 13049000, 16],
    ["Cinder Pit", "5hekel", 4312200, 18],
    ["Stonegarden", "SheronMan", 3932180, 17],
    ["Obsidian Hollows", "Duartyh", 3820000, 19],
    ["Redshaft", "LukeEm", 3442500, 20],
  ];

  for (const [sourceServer, username, blocksMined, hoursAgo] of baseRows) {
    entries.push({
      username,
      sourceServer,
      sourceSlug: slugify(sourceServer),
      blocksMined,
      lastUpdated: isoHoursAgo(hoursAgo),
    });
  }

  legacyPublicSources.forEach((source, sourceIndex) => {
    generatedNames.forEach((username, nameIndex) => {
      if ((nameIndex + sourceIndex) % 2 !== 0) return;
      const blocksMined = Math.max(
        210000,
        6200000 - sourceIndex * 480000 - nameIndex * 73000 + ((nameIndex % 7) * 18000),
      );

      entries.push({
        username,
        sourceServer: source.displayName,
        sourceSlug: source.slug,
        blocksMined,
        lastUpdated: isoHoursAgo(20 + ((nameIndex + sourceIndex) % 48)),
      });
    });
  });

  return entries;
}

const legacySourceEntries = createLegacySourceEntries();

function buildLegacySourceRows(source) {
  return legacySourceEntries
    .filter((entry) => entry.sourceSlug === source.slug)
    .sort((a, b) => b.blocksMined - a.blocksMined || a.username.localeCompare(b.username))
    .map((entry, index) => ({
      playerId: entry.username.toLowerCase() === "5hekel" ? "local-owner-player" : `anon:${entry.username.toLowerCase()}`,
      username: entry.username,
      skinFaceUrl: skinFaceUrl(entry.username),
      playerFlagUrl: null,
      lastUpdated: entry.lastUpdated,
      blocksMined: entry.blocksMined,
      totalDigs: entry.blocksMined,
      rank: index + 1,
      sourceServer: source.displayName,
      sourceKey: `${source.slug}:${entry.username.toLowerCase()}`,
      sourceCount: 1,
      viewKind: "source",
      sourceId: source.id,
      sourceSlug: source.slug,
      rowKey: `${source.slug}:${entry.username.toLowerCase()}`,
    }));
}

function buildLegacyMainRows() {
  const byUsername = new Map();

  for (const entry of legacySourceEntries) {
    const key = entry.username.toLowerCase();
    const existing = byUsername.get(key) ?? {
      playerId: key === "5hekel" ? "local-owner-player" : `anon:${key}`,
      username: entry.username,
      skinFaceUrl: skinFaceUrl(entry.username),
      lastUpdated: entry.lastUpdated,
      blocksMined: 0,
      totalDigs: 0,
      sourceCount: 0,
      strongestSource: entry.sourceServer,
      strongestBlocks: 0,
      sourceId: null,
      sourceSlug: null,
    };

    existing.blocksMined += entry.blocksMined;
    existing.totalDigs += entry.blocksMined;
    existing.sourceCount += 1;

    if (entry.blocksMined > existing.strongestBlocks) {
      const source = legacyPublicSources.find((candidate) => candidate.slug === entry.sourceSlug) ?? null;
      existing.strongestBlocks = entry.blocksMined;
      existing.strongestSource = entry.sourceServer;
      existing.sourceId = source?.id ?? null;
      existing.sourceSlug = source?.slug ?? null;
    }

    if (new Date(entry.lastUpdated).getTime() > new Date(existing.lastUpdated).getTime()) {
      existing.lastUpdated = entry.lastUpdated;
    }

    byUsername.set(key, existing);
  }

  return Array.from(byUsername.values())
    .sort((a, b) => b.blocksMined - a.blocksMined || a.username.localeCompare(b.username))
    .map((entry, index) => ({
      playerId: entry.playerId,
      username: entry.username,
      skinFaceUrl: entry.skinFaceUrl,
      playerFlagUrl: entry.playerFlagUrl ?? null,
      lastUpdated: entry.lastUpdated,
      blocksMined: entry.blocksMined,
      totalDigs: entry.totalDigs,
      rank: index + 1,
      sourceServer: entry.strongestSource,
      sourceKey: `global:${entry.username.toLowerCase()}`,
      sourceCount: entry.sourceCount,
      viewKind: "global",
      sourceId: entry.sourceId,
      sourceSlug: entry.sourceSlug,
      rowKey: `global:${entry.username.toLowerCase()}`,
    }));
}

const spreadsheetPublicSources = spreadsheetSnapshot
  ? spreadsheetSnapshot.sources.map((source) => ({
      id: source.id,
      slug: source.slug,
      displayName: source.displayName,
      sourceType: source.sourceType,
      logoUrl: source.logoUrl,
      totalBlocks: source.totalBlocks,
      isDead: source.isDead,
      playerCount: source.playerCount,
      sourceScope: source.sourceScope,
      hasSpreadsheetTotal: source.hasSpreadsheetTotal,
    }))
  : null;

const spreadsheetSourceBySlug = new Map(
  (spreadsheetSnapshot?.sources ?? []).map((source) => [source.slug, source]),
);
const spreadsheetSpecialLeaderboards = spreadsheetSnapshot?.specialLeaderboards ?? {};

const publicSources = spreadsheetPublicSources ?? legacyPublicSources;
const legacyMainRows = buildLegacyMainRows();
const mainRows = spreadsheetSnapshot?.mainLeaderboard?.rows ?? legacyMainRows;

function buildSourceRows(source) {
  const spreadsheetSource = spreadsheetSourceBySlug.get(source.slug);
  if (spreadsheetSource) {
    return spreadsheetSource.rows;
  }

  return buildLegacySourceRows(source);
}

const dashboardSnapshot = {
  meta: {
    source: "demo",
    title: "Local owner snapshot",
    description: "Local-only MMM snapshot with seeded data for UI testing.",
  },
  viewer,
  player: {
    id: "local-owner-player",
    username: "5hekel",
    firstSeenAt: "2026-03-21T09:15:00Z",
    lastSeenAt: isoHoursAgo(1),
    lastModVersion: "1.0.5",
    lastMinecraftVersion: "1.21.4",
    lastServerName: "Aeternum",
    totalSyncedBlocks: 14749963,
    aeternumTotalDigs: 10437763,
    totalSessions: 318,
    totalPlaySeconds: 1523200,
    trustLevel: "owner",
  },
  projects: [
    { id: "p1", key: "endstone-quarry", name: "Endstone Quarry", progress: 128400, goal: 180000, percent: 71, isActive: true, lastSyncedAt: isoHoursAgo(2), status: "active" },
    { id: "p2", key: "spawn-perimeter", name: "Spawn Perimeter", progress: 88000, goal: 120000, percent: 73, isActive: false, lastSyncedAt: isoHoursAgo(7), status: "active" },
    { id: "p3", key: "deep-slate-strip", name: "Deep Slate Strip", progress: 51000, goal: 51000, percent: 100, isActive: false, lastSyncedAt: isoHoursAgo(32), status: "complete" },
  ],
  sessions: [
    { id: "s1", sessionKey: "sess-1", worldId: "w1", startedAt: isoHoursAgo(4), endedAt: isoHoursAgo(1.75), activeSeconds: 8100, totalBlocks: 2840, averageBph: 1262, peakBph: 1730, bestStreakSeconds: 930, topBlock: "minecraft:end_stone", status: "ended" },
    { id: "s2", sessionKey: "sess-2", worldId: "w1", startedAt: isoHoursAgo(28), endedAt: isoHoursAgo(25.5), activeSeconds: 9000, totalBlocks: 3310, averageBph: 1324, peakBph: 1810, bestStreakSeconds: 1040, topBlock: "minecraft:deepslate", status: "ended" },
    { id: "s3", sessionKey: "sess-3", worldId: "w2", startedAt: isoHoursAgo(52), endedAt: isoHoursAgo(49), activeSeconds: 10800, totalBlocks: 4020, averageBph: 1340, peakBph: 1900, bestStreakSeconds: 1210, topBlock: "minecraft:netherrack", status: "ended" },
    { id: "s4", sessionKey: "sess-4", worldId: "w3", startedAt: isoHoursAgo(74), endedAt: isoHoursAgo(71.2), activeSeconds: 10140, totalBlocks: 3540, averageBph: 1256, peakBph: 1688, bestStreakSeconds: 870, topBlock: "minecraft:stone", status: "ended" },
  ],
  dailyGoal: {
    goalDate: new Date(NOW).toISOString().slice(0, 10),
    target: 2500,
    progress: 1820,
    completed: false,
    percent: 73,
  },
  worlds: [
    { id: "w1", displayName: "Aeternum", kind: "multiplayer", totalBlocks: 10437763, totalSessions: 182, totalPlaySeconds: 782000, lastSeenAt: isoHoursAgo(2) },
    { id: "w2", displayName: "Redshaft", kind: "multiplayer", totalBlocks: 4312200, totalSessions: 79, totalPlaySeconds: 342000, lastSeenAt: isoHoursAgo(26) },
    { id: "w3", displayName: "Stonegarden", kind: "multiplayer", totalBlocks: 0, totalSessions: 0, totalPlaySeconds: 0, lastSeenAt: isoHoursAgo(150) },
  ],
  notifications: [
    { id: "n1", kind: "rank", title: "You are #2 on Aeternum", body: "16.1M more blocks to pass LukeEm locally.", createdAt: isoHoursAgo(1.5) },
    { id: "n2", kind: "session", title: "Session synced", body: "Latest local mining session was added to your dashboard.", createdAt: isoHoursAgo(2) },
    { id: "n3", kind: "project", title: "Endstone Quarry hit 71%", body: "51,600 blocks remain.", createdAt: isoHoursAgo(6) },
  ],
  leaderboard: {
    leaderboardType: "global",
    score: 14749963,
    rankCached: 4,
    updatedAt: isoHoursAgo(3),
  },
  settings: {
    autoSyncMiningData: true,
    crossServerAggregation: true,
    realTimeHudSync: false,
    leaderboardOptIn: true,
    publicProfile: true,
    sessionSharing: false,
    hudEnabled: true,
    hudAlignment: "top-right",
    hudScale: 1,
  },
  estimatedBlocksPerHour: 1285,
  estimatedFinishSeconds: 156000,
  lastSyncedAt: isoHoursAgo(1.75),
};

const adminSources = legacyPublicSources.map((source, index) => ({
  id: source.id,
  displayName: source.displayName,
  worldKey: source.slug,
  kind: "multiplayer",
  sourceScope: "public_server",
  totalBlocks: buildLegacySourceRows(source).reduce((sum, row) => sum + row.blocksMined, 0),
  playerCount: buildLegacySourceRows(source).length,
  submittedByUsername: index === 0 ? "5hekel" : "LukeEm",
  submittedAt: isoHoursAgo(72 + index * 8),
  firstSeenAt: isoHoursAgo(240 + index * 16),
  lastSeenAt: isoHoursAgo(3 + index),
  approvalStatus: "approved",
  eligibleForPublic: true,
  scanEvidence: {
    scoreboardTitle: `${source.displayName} Source`,
    sampleSidebarLines: ["Blocks Mined", "Top Miners", "Server Totals"],
    detectedStatFields: ["blocks_mined", "player_name"],
    confidence: 0.98,
    iconUrl: null,
    rawScanEvidence: null,
  },
}));

const localAdminState = createLocalAdminState({
  spreadsheetSnapshot,
  publicSources,
  mainRows,
  adminSources,
  viewer,
});

function json(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-csrf-token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Cookie",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function empty(response, status, extraHeaders = {}) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-csrf-token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    ...extraHeaders,
  });
  response.end();
}

function applyLeaderboardFilters(rows, searchQuery, minBlocks) {
  const query = searchQuery.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesQuery = !query
      || row.username.toLowerCase().includes(query)
      || row.sourceServer.toLowerCase().includes(query);
    return matchesQuery && row.blocksMined >= minBlocks;
  });
}

function paginateRows(rows, page, pageSize) {
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

function leaderboardPayload(sourceSlug, url) {
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "30")));
  const minBlocks = Math.max(0, Number(url.searchParams.get("minBlocks") || "0"));
  const query = url.searchParams.get("query") || "";
  const publicSourcesNow = localAdminState.getPublicSources();

  if (!sourceSlug) {
    const baseRows = localAdminState.getMainRows();
    const filteredRows = applyLeaderboardFilters(baseRows, query, minBlocks);
    const paginated = paginateRows(filteredRows, page, pageSize);
    const isFiltered = Boolean(query.trim()) || minBlocks > 0;
    const siteContent = localAdminState.getSiteContent();

    return {
      scope: "main",
      title: siteContent["leaderboard.mainTitle"] || "Single Players",
      description: siteContent["leaderboard.mainDescription"] || spreadsheetSnapshot?.mainLeaderboard?.description || "Combined totals across all approved server sources in the local MMM build.",
      scoreLabel: "Blocks Mined",
      source: null,
      featuredRows: filteredRows.slice(0, 3),
      rows: paginated.rows,
      page: paginated.page,
      pageSize: paginated.pageSize,
      totalRows: paginated.totalRows,
      totalPages: paginated.totalPages,
      totalBlocks: isFiltered ? filteredRows.reduce((sum, row) => sum + row.blocksMined, 0) : filteredRows.reduce((sum, row) => sum + row.blocksMined, 0),
      playerCount: filteredRows.length,
      highlightedPlayer: "5hekel",
      publicSources: publicSourcesNow,
    };
  }

  const source = publicSourcesNow.find((candidate) => candidate.slug === sourceSlug);
  if (!source) {
    return null;
  }

  const spreadsheetSource = spreadsheetSourceBySlug.get(source.slug) ?? null;
  const sourceRows = localAdminState.getSourceRows(source.slug) ?? [];
  const filteredRows = applyLeaderboardFilters(sourceRows, query, minBlocks);
  const paginated = paginateRows(filteredRows, page, pageSize);
  const isFiltered = Boolean(query.trim()) || minBlocks > 0;

  return {
    scope: "source",
    title: source.displayName,
    description:
      spreadsheetSource?.sourceScope === "private_server_digs"
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
    totalBlocks: isFiltered ? filteredRows.reduce((sum, row) => sum + row.blocksMined, 0) : (source.totalBlocks ?? filteredRows.reduce((sum, row) => sum + row.blocksMined, 0)),
    playerCount: isFiltered ? filteredRows.length : (spreadsheetSource?.playerCount ?? filteredRows.length),
    highlightedPlayer: "5hekel",
    publicSources: publicSourcesNow,
  };
}

function specialLeaderboardPayload(kind, url) {
  const dataset = localAdminState.getSpecialLeaderboard(kind) ?? spreadsheetSpecialLeaderboards[kind];
  if (!dataset) {
    return null;
  }

  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "30")));
  const minBlocks = Math.max(0, Number(url.searchParams.get("minBlocks") || "0"));
  const query = url.searchParams.get("query") || "";
  const filteredRows = applyLeaderboardFilters(dataset.rows, query, minBlocks);
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
    totalBlocks: isFiltered ? filteredRows.reduce((sum, row) => sum + row.blocksMined, 0) : dataset.totalBlocks,
    playerCount: isFiltered ? filteredRows.length : dataset.playerCount,
    highlightedPlayer: "5hekel",
    icons: dataset.icons ?? null,
  };
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      if (!raw.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

async function requestHandler(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const currentViewer = localAdminState.getViewer();

  if (request.method === "OPTIONS") {
    empty(response, 204);
    return;
  }

  if (url.pathname === "/api/me" && request.method === "GET") {
    response.setHeader("Set-Cookie", "aetweaks_csrf=local-dev-csrf; Path=/; SameSite=Strict");
    json(response, 200, { authenticated: true, user: currentViewer });
    return;
  }

  if (url.pathname === "/api/dashboard" && request.method === "GET") {
    response.setHeader("Set-Cookie", "aetweaks_csrf=local-dev-csrf; Path=/; SameSite=Strict");
    json(response, 200, {
      ...dashboardSnapshot,
      viewer: currentViewer,
      meta: {
        ...dashboardSnapshot.meta,
        title: localAdminState.getSiteContent()["dashboard.heroTitle"] || dashboardSnapshot.meta.title,
        description: localAdminState.getSiteContent()["dashboard.heroSubtitle"] || dashboardSnapshot.meta.description,
      },
    });
    return;
  }

  if (url.pathname === "/api/site-content" && request.method === "GET") {
    json(response, 200, { content: localAdminState.getSiteContent() });
    return;
  }

  if (url.pathname === "/api/auth/session-heartbeat") {
    if (request.method !== "POST") {
      json(response, 405, { error: "Method not allowed." });
      return;
    }
    if (request.headers["x-csrf-token"] !== "local-dev-csrf") {
      json(response, 403, { error: "Invalid CSRF token." });
      return;
    }
    json(response, 200, { ok: true, touchedAt: new Date().toISOString() });
    return;
  }

  if (url.pathname === "/api/leaderboard-sources" && request.method === "GET") {
    json(response, 200, localAdminState.getPublicSources());
    return;
  }

  if (url.pathname === "/api/leaderboard" && request.method === "GET") {
    const payload = leaderboardPayload(url.searchParams.get("source"), url);
    if (!payload) {
      json(response, 404, { error: "Leaderboard not found." });
      return;
    }
    json(response, 200, payload);
    return;
  }

  if (url.pathname === "/api/leaderboard-special" && request.method === "GET") {
    const payload = specialLeaderboardPayload(url.searchParams.get("kind"), url);
    if (!payload) {
      json(response, 404, { error: "Special leaderboard not found." });
      return;
    }
    json(response, 200, payload);
    return;
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (request.headers["x-csrf-token"] && request.headers["x-csrf-token"] !== "local-dev-csrf") {
      json(response, 403, { error: "Invalid CSRF token." });
      return;
    }

    if (url.pathname === "/api/admin/sources" && request.method === "GET") {
      json(response, 200, { sources: localAdminState.getModerationSources(), minimumBlocks: 0 });
      return;
    }

    const body = request.method === "POST" ? await readJsonBody(request) : null;

    if (url.pathname === "/api/admin/sources" && request.method === "POST") {
      if (!isManagementRole(currentViewer.role)) {
        json(response, 403, { error: "Insufficient permissions." });
        return;
      }
      if (!body?.sourceId || !body?.action) {
        json(response, 400, { error: "Invalid payload." });
        return;
      }
      try {
        json(response, 200, localAdminState.updateSourceModeration({
          actorRole: currentViewer.role,
          sourceId: body.sourceId,
          action: body.action,
          reason: body.reason ?? null,
        }));
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : "Unable to update source." });
      }
      return;
    }

    if (url.pathname === "/api/admin/roles" && request.method === "GET") {
      if (!isOwnerRole(currentViewer.role)) {
        json(response, 403, { error: "Only an owner can manage roles." });
        return;
      }
      try {
        json(response, 200, localAdminState.lookupRole(url.searchParams.get("uuid") ?? ""));
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : "Unable to look up role." });
      }
      return;
    }

    if (url.pathname === "/api/admin/roles" && request.method === "POST") {
      if (!isOwnerRole(currentViewer.role)) {
        json(response, 403, { error: "Only an owner can manage roles." });
        return;
      }
      try {
        json(response, 200, localAdminState.setRole({
          actorRole: currentViewer.role,
          actorUserId: currentViewer.userId,
          uuid: body?.uuid ?? "",
          role: body?.role ?? "",
          reason: body?.reason ?? null,
        }));
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : "Unable to update role." });
      }
      return;
    }

    if (url.pathname === "/api/admin/flags" && request.method === "GET") {
      if (!isManagementRole(currentViewer.role)) {
        json(response, 403, { error: "You do not have permission to manage player flags." });
        return;
      }
      try {
        json(response, 200, localAdminState.lookupFlag(url.searchParams.get("uuid") ?? ""));
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : "Unable to look up player flag." });
      }
      return;
    }

    if (url.pathname === "/api/admin/flags" && request.method === "POST") {
      if (!isManagementRole(currentViewer.role)) {
        json(response, 403, { error: "You do not have permission to manage player flags." });
        return;
      }
      try {
        json(response, 200, localAdminState.setFlag({
          actorRole: currentViewer.role,
          uuid: body?.uuid ?? "",
          flagCode: body?.flagCode ?? null,
          reason: body?.reason ?? null,
        }));
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : "Unable to update player flag." });
      }
      return;
    }

    if (url.pathname === "/api/admin/editor" && request.method === "GET") {
      if (!isManagementRole(currentViewer.role)) {
        json(response, 403, { error: "You do not have permission to use the editor." });
        return;
      }
      try {
        const kind = url.searchParams.get("kind") ?? "";
        if (kind === "sources") {
          json(response, 200, localAdminState.searchEditableSources(url.searchParams.get("query") ?? ""));
          return;
        }
        if (kind === "source-rows") {
          json(response, 200, localAdminState.getEditableSourceRows(url.searchParams.get("sourceId") ?? "", url.searchParams.get("query") ?? ""));
          return;
        }
        if (kind === "audit") {
          json(response, 200, localAdminState.getAuditEntries());
          return;
        }
        json(response, 400, { error: "Unsupported editor query." });
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : "Unable to load editor data." });
      }
      return;
    }

    if (url.pathname === "/api/admin/editor" && request.method === "POST") {
      if (!isManagementRole(currentViewer.role)) {
        json(response, 403, { error: "You do not have permission to use the editor." });
        return;
      }
      try {
        if (body?.action === "update-source") {
          json(response, 200, localAdminState.updateSource({
            actorRole: currentViewer.role,
            sourceId: body.sourceId ?? "",
            displayName: body.displayName ?? "",
            reason: body.reason ?? null,
          }));
          return;
        }
        if (body?.action === "update-source-player") {
          json(response, 200, localAdminState.updateSourcePlayer({
            actorRole: currentViewer.role,
            sourceId: body.sourceId ?? "",
            playerId: body.playerId ?? "",
            username: body.username ?? null,
            blocksMined: body.blocksMined,
            reason: body.reason ?? null,
          }));
          return;
        }
        if (body?.action === "update-site-content") {
          json(response, 200, localAdminState.updateSiteContent({
            actorRole: currentViewer.role,
            key: body.key ?? "",
            value: body.value ?? "",
            reason: body.reason ?? null,
          }));
          return;
        }
        json(response, 400, { error: "Unsupported editor action." });
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : "Unable to update editor data." });
      }
      return;
    }
  }

  json(response, 404, { error: "Not found." });
}

const server = http.createServer(requestHandler);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[local-owner-api] running on http://127.0.0.1:${PORT}`);
});
