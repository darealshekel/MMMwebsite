import crypto from "node:crypto";
import {
  canTransitionRole,
  isAllowedSiteContentKey,
  isManagementRole,
  normalizeAppRole,
  normalizeMinecraftUuid,
  normalizePlayerFlagCode,
  parseNonNegativeInteger,
  sanitizeEditableText,
  sanitizeRejectReason,
  sanitizeSiteContentValue,
} from "../shared/admin-management.js";
import {
  isHspSource,
  isSspHspSource,
  isSspSource,
  specialLeaderboardLabel,
} from "../shared/source-classification.js";

const INVISIBLE_NAME_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;
const NEW_SUFFIX = /(?:\s*\(\s*new\s*\)\s*)+$/i;
const ROLE_PRIORITY = {
  player: 0,
  admin: 1,
  owner: 2,
};

const DEFAULT_STEVE_SKIN_FACE_URL = "https://minotar.net/avatar/Steve/32";
const WHITESPACE_USERNAME = /\s/;

function skinFaceUrl(username) {
  if (WHITESPACE_USERNAME.test(String(username ?? "").trim())) {
    return DEFAULT_STEVE_SKIN_FACE_URL;
  }
  return `https://minotar.net/avatar/${encodeURIComponent(username)}/32`;
}

function fakeUuidForUsername(username) {
  const canonicalName = normalizeCanonicalPlayerName(username);
  const hex = crypto.createHash("md5").update(`mmm-local:${canonicalName}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function cleanPlayerDisplayName(value) {
  return String(value ?? "")
    .replace(INVISIBLE_NAME_CHARS, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(NEW_SUFFIX, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeCanonicalPlayerName(value) {
  return cleanPlayerDisplayName(value).toLowerCase();
}

function assertCanonicalName(value) {
  const canonicalName = normalizeCanonicalPlayerName(value);
  if (!canonicalName) {
    throw new Error("Player name cannot be empty.");
  }
  return canonicalName;
}

function roleWithHigherPriority(left, right) {
  return (ROLE_PRIORITY[right] ?? 0) > (ROLE_PRIORITY[left] ?? 0) ? right : left;
}

function newerTimestamp(left, right) {
  if (!left) return right;
  if (!right) return left;
  return new Date(right).getTime() > new Date(left).getTime() ? right : left;
}

function slugify(value) {
  return cleanPlayerDisplayName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source";
}

function sortRows(rows) {
  return [...rows].sort((left, right) => {
    if (right.blocksMined !== left.blocksMined) {
      return right.blocksMined - left.blocksMined;
    }
    return left.username.localeCompare(right.username);
  }).map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

function buildRegistryEntry(username, playerFlagUrl = null) {
  const displayName = cleanPlayerDisplayName(username);
  const canonicalName = assertCanonicalName(displayName);
  return {
    uuid: fakeUuidForUsername(canonicalName),
    minecraftUuidHash: `local:${fakeUuidForUsername(canonicalName)}`,
    username: displayName,
    displayName,
    canonicalName,
    canonical_name: canonicalName,
    role: "player",
    flagCode: null,
    flagUrl: playerFlagUrl,
    userId: `local-user:${canonicalName}`,
    playerId: canonicalName === "5hekel" ? "local-owner-player" : `local-player:${canonicalName}`,
  };
}

export function createLocalAdminState({ spreadsheetSnapshot, publicSources, mainRows, adminSources, viewer }) {
  const players = new Map();
  const sourceMap = new Map();
  const mainLeaderboardRows = [];
  const auditEntries = [];
  const siteContent = {};
  let auditId = 1;

  const resolveOrCreatePlayer = (username, initialFlagUrl = null) => {
    const cleanUsername = cleanPlayerDisplayName(username);
    const key = assertCanonicalName(cleanUsername);
    const existing = players.get(key);
    if (existing) {
      if (!existing.flagUrl && initialFlagUrl) {
        existing.flagUrl = initialFlagUrl;
      }
      return existing;
    }
    const created = buildRegistryEntry(cleanUsername, initialFlagUrl);
    players.set(key, created);
    return created;
  };

  const mergeRowsForCanonicalPlayer = (rows) => {
    const byPlayer = new Map();

    for (const rawRow of rows) {
      const player = resolveOrCreatePlayer(rawRow.username, rawRow.playerFlagUrl ?? null);
      const blocksMined = Number(rawRow.blocksMined ?? 0);
      const existing = byPlayer.get(player.canonicalName);
      const normalizedRow = {
        playerId: player.playerId,
        username: player.username,
        canonicalName: player.canonicalName,
        blocksMined,
        lastUpdated: rawRow.lastUpdated,
      };

      if (!existing) {
        byPlayer.set(player.canonicalName, normalizedRow);
        continue;
      }

      // Duplicate local identities such as "Player" and "Player (new)" are
      // the same source contribution; keep the highest value to avoid double counting.
      existing.blocksMined = Math.max(existing.blocksMined, blocksMined);
      existing.lastUpdated = newerTimestamp(existing.lastUpdated, rawRow.lastUpdated);
    }

    return sortRows([...byPlayer.values()]);
  };

  const upsertMainLeaderboardRow = (rawRow) => {
    const player = resolveOrCreatePlayer(rawRow.username, rawRow.playerFlagUrl ?? null);
    const existing = mainLeaderboardRows.find((row) => row.canonicalName === player.canonicalName);
    const blocksMined = Number(rawRow.blocksMined ?? 0);
    const totalDigs = Number(rawRow.totalDigs ?? rawRow.blocksMined ?? 0);
    const normalizedRow = {
      playerId: rawRow.playerId ?? player.playerId,
      username: player.username,
      canonicalName: player.canonicalName,
      lastUpdated: rawRow.lastUpdated,
      blocksMined,
      totalDigs,
      sourceCount: Number(rawRow.sourceCount ?? 0),
      sourceServer: rawRow.sourceServer ?? null,
      sourceId: rawRow.sourceId ?? null,
      sourceSlug: rawRow.sourceSlug ?? null,
    };

    if (!existing) {
      mainLeaderboardRows.push(normalizedRow);
      return normalizedRow;
    }

    const shouldReplaceSource = blocksMined > existing.blocksMined;
    existing.blocksMined = Math.max(existing.blocksMined, blocksMined);
    existing.totalDigs = Math.max(existing.totalDigs ?? 0, totalDigs);
    existing.sourceCount = Math.max(existing.sourceCount ?? 0, normalizedRow.sourceCount);
    existing.lastUpdated = newerTimestamp(existing.lastUpdated, normalizedRow.lastUpdated);
    if (shouldReplaceSource) {
      existing.sourceServer = normalizedRow.sourceServer;
      existing.sourceId = normalizedRow.sourceId;
      existing.sourceSlug = normalizedRow.sourceSlug;
    }
    return existing;
  };

  const updateMainLeaderboardDelta = (canonicalName, delta, fallbackUsername, lastUpdated, source = null) => {
    const player = resolveOrCreatePlayer(fallbackUsername);
    const row = mainLeaderboardRows.find((entry) => entry.canonicalName === canonicalName)
      ?? upsertMainLeaderboardRow({
        username: player.username,
        playerId: player.playerId,
        lastUpdated,
        blocksMined: 0,
        totalDigs: 0,
        sourceCount: 0,
        sourceServer: source?.displayName ?? null,
        sourceId: source?.id ?? null,
        sourceSlug: source?.slug ?? null,
      });
    row.username = player.username;
    row.playerId = player.playerId;
    row.blocksMined = Math.max(0, Number(row.blocksMined ?? 0) + delta);
    row.totalDigs = Math.max(0, Number(row.totalDigs ?? 0) + delta);
    row.lastUpdated = newerTimestamp(row.lastUpdated, lastUpdated);
    row.sourceCount = Math.max(Number(row.sourceCount ?? 0), source ? 1 : 0);
    if (source && delta >= 0) {
      row.sourceServer = source.displayName;
      row.sourceId = source.id;
      row.sourceSlug = source.slug;
    }
    return row;
  };

  const rebuildMainLeaderboardRowsFromSources = () => {
    const byCanonical = new Map();
    for (const source of sourceMap.values()) {
      if (source.approvalStatus !== "approved") continue;
      for (const sourceRow of source.rows) {
        const player = players.get(sourceRow.canonicalName) ?? resolveOrCreatePlayer(sourceRow.username);
        const existing = byCanonical.get(player.canonicalName) ?? {
          playerId: player.playerId,
          username: player.username,
          canonicalName: player.canonicalName,
          lastUpdated: sourceRow.lastUpdated,
          blocksMined: 0,
          totalDigs: 0,
          sourceCount: 0,
          sourceServer: source.displayName,
          sourceId: source.id,
          sourceSlug: source.slug,
          strongestBlocks: 0,
        };
        existing.blocksMined += sourceRow.blocksMined;
        existing.totalDigs += sourceRow.blocksMined;
        existing.sourceCount += 1;
        existing.lastUpdated = newerTimestamp(existing.lastUpdated, sourceRow.lastUpdated);
        if (sourceRow.blocksMined >= existing.strongestBlocks) {
          existing.strongestBlocks = sourceRow.blocksMined;
          existing.sourceServer = source.displayName;
          existing.sourceId = source.id;
          existing.sourceSlug = source.slug;
        }
        byCanonical.set(player.canonicalName, existing);
      }
    }

    mainLeaderboardRows.length = 0;
    mainLeaderboardRows.push(...[...byCanonical.values()].map(({ strongestBlocks, ...row }) => row));
  };

  const removeDuplicateRowsInSource = (source) => {
    source.rows = mergeRowsForCanonicalPlayer(source.rows);
    source.totalBlocks = source.rows.reduce((sum, entry) => sum + entry.blocksMined, 0);
  };

  const mergePlayerRegistry = (fromCanonicalName, toPlayer) => {
    if (fromCanonicalName === toPlayer.canonicalName) {
      return;
    }
    const fromPlayer = players.get(fromCanonicalName);
    if (fromPlayer) {
      toPlayer.role = roleWithHigherPriority(toPlayer.role, fromPlayer.role);
      toPlayer.flagCode ??= fromPlayer.flagCode;
      toPlayer.flagUrl ??= fromPlayer.flagUrl;
      if (fromPlayer.userId === viewer.userId) {
        toPlayer.userId = fromPlayer.userId;
      }
      players.delete(fromCanonicalName);
    }
  };

  const mergePlayerIdentity = (fromCanonicalName, nextDisplayName) => {
    const targetPlayer = resolveOrCreatePlayer(nextDisplayName);
    if (fromCanonicalName === targetPlayer.canonicalName) {
      return targetPlayer;
    }

    mergePlayerRegistry(fromCanonicalName, targetPlayer);

    for (const source of sourceMap.values()) {
      for (const row of source.rows) {
        if (row.canonicalName === fromCanonicalName) {
          row.canonicalName = targetPlayer.canonicalName;
          row.playerId = targetPlayer.playerId;
          row.username = targetPlayer.username;
        }
      }
      removeDuplicateRowsInSource(source);
    }

    for (const row of mainLeaderboardRows) {
      if (row.canonicalName === fromCanonicalName) {
        row.canonicalName = targetPlayer.canonicalName;
        row.playerId = targetPlayer.playerId;
        row.username = targetPlayer.username;
      }
    }

    const mainByCanonical = new Map();
    for (const row of mainLeaderboardRows.splice(0)) {
      const existing = mainByCanonical.get(row.canonicalName);
      if (!existing) {
        mainByCanonical.set(row.canonicalName, row);
        continue;
      }
      existing.blocksMined = Math.max(existing.blocksMined, row.blocksMined);
      existing.totalDigs = Math.max(existing.totalDigs ?? 0, row.totalDigs ?? row.blocksMined);
      existing.sourceCount = Math.max(existing.sourceCount ?? 0, row.sourceCount ?? 0);
      existing.lastUpdated = newerTimestamp(existing.lastUpdated, row.lastUpdated);
    }
    mainLeaderboardRows.push(...mainByCanonical.values());

    return targetPlayer;
  };

  const specialSeedSources = Object.values(spreadsheetSnapshot?.specialLeaderboards ?? {})
    .flatMap((leaderboard) => Array.isArray(leaderboard?.sources) ? leaderboard.sources : []);
  const seedSources = [...(spreadsheetSnapshot?.sources ?? []), ...specialSeedSources];
  for (const source of seedSources) {
    const rows = mergeRowsForCanonicalPlayer(source.rows ?? []);

    sourceMap.set(source.slug, {
      id: source.id,
      slug: source.slug,
      displayName: source.displayName,
      sourceType: source.sourceType,
        logoUrl: source.logoUrl ?? null,
        isDead: Boolean(source.isDead),
        sourceScope: source.sourceScope ?? "digs_logo_only",
        sourceCategory: source.sourceCategory ?? null,
        sourceIdentity: source.sourceIdentity ?? null,
        sourceSymbolHash: source.sourceSymbolHash ?? null,
        hasSpreadsheetTotal: Boolean(source.hasSpreadsheetTotal),
      approvalStatus: "approved",
      reviewNote: null,
      rows,
      totalBlocks: rows.reduce((sum, row) => sum + row.blocksMined, 0),
    });
  }

  for (const row of mainRows ?? []) {
    upsertMainLeaderboardRow(row);
  }

  const viewerPlayer = resolveOrCreatePlayer(viewer.username, null);
  viewerPlayer.role = "owner";
  viewerPlayer.userId = viewer.userId;
  viewerPlayer.playerId = "local-owner-player";

  const moderationById = new Map();
  for (const source of adminSources ?? []) {
    moderationById.set(source.id, {
      ...source,
      approvalStatus: source.approvalStatus ?? "approved",
      reviewNote: null,
    });
  }

  const ensureAudit = (entry) => {
    auditEntries.unshift({
      id: `audit-${auditId++}`,
      ...entry,
      createdAt: new Date().toISOString(),
    });
    return auditEntries[0];
  };

  const derivePublicSources = () =>
    [...sourceMap.values()]
      .filter((source) => source.approvalStatus === "approved")
      .map((source) => ({
        id: source.id,
        slug: source.slug,
        displayName: source.displayName,
        sourceType: source.sourceType,
        logoUrl: source.logoUrl,
        totalBlocks: source.totalBlocks,
        isDead: source.isDead,
        playerCount: source.rows.length,
          sourceScope: source.sourceScope,
          sourceCategory: source.sourceCategory,
          sourceIdentity: source.sourceIdentity,
          sourceSymbolHash: source.sourceSymbolHash,
          hasSpreadsheetTotal: source.hasSpreadsheetTotal,
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const deriveSourceRows = (sourceSlug) => {
    const source = sourceMap.get(sourceSlug);
    if (!source || source.approvalStatus !== "approved") {
      return null;
    }
    return sortRows(source.rows).map((row) => {
      const player = players.get(row.canonicalName ?? normalizeCanonicalPlayerName(row.username));
      return {
        playerId: player?.playerId ?? row.playerId,
        username: player?.username ?? row.username,
        skinFaceUrl: skinFaceUrl(player?.username ?? row.username),
        playerFlagUrl: player?.flagUrl ?? null,
        lastUpdated: row.lastUpdated,
        blocksMined: row.blocksMined,
        totalDigs: row.blocksMined,
        rank: row.rank,
        sourceServer: source.displayName,
        sourceKey: `${source.slug}:${player?.canonicalName ?? row.canonicalName}`,
        sourceCount: 1,
        viewKind: "source",
        sourceId: source.id,
        sourceSlug: source.slug,
        rowKey: `${source.slug}:${player?.canonicalName ?? row.canonicalName}`,
      };
    });
  };

  const deriveMainRows = () =>
    sortRows(mainLeaderboardRows.map((row) => ({ ...row }))).map((row) => {
      const player = players.get(row.canonicalName ?? normalizeCanonicalPlayerName(row.username));
      return {
        playerId: row.playerId ?? player?.playerId ?? `anon:${row.username.toLowerCase()}`,
        username: player?.username ?? row.username,
        skinFaceUrl: skinFaceUrl(player?.username ?? row.username),
        playerFlagUrl: player?.flagUrl ?? null,
        lastUpdated: row.lastUpdated,
        blocksMined: row.blocksMined,
        totalDigs: row.totalDigs ?? row.blocksMined,
        rank: row.rank,
        sourceServer: row.sourceServer,
        sourceKey: `global:${row.username.toLowerCase()}`,
        sourceCount: row.sourceCount,
        viewKind: "global",
        sourceId: row.sourceId,
        sourceSlug: row.sourceSlug,
        rowKey: `global:${player?.canonicalName ?? row.canonicalName ?? normalizeCanonicalPlayerName(row.username)}`,
      };
    });

  const deriveSourceTotalsByPlayer = () => {
    const byCanonical = new Map();
    for (const source of sourceMap.values()) {
      if (source.approvalStatus !== "approved") continue;
      for (const row of source.rows) {
        const player = players.get(row.canonicalName) ?? resolveOrCreatePlayer(row.username);
        const existing = byCanonical.get(player.canonicalName) ?? {
          player,
          blocksMined: 0,
          sourceCount: 0,
          lastUpdated: row.lastUpdated,
        };
        existing.blocksMined += Number(row.blocksMined ?? 0);
        existing.sourceCount += 1;
        existing.lastUpdated = newerTimestamp(existing.lastUpdated, row.lastUpdated);
        byCanonical.set(player.canonicalName, existing);
      }
    }
    return byCanonical;
  };

  const isSsphspSource = (source, kind = "ssp-hsp") => {
    if (kind === "ssp") return isSspSource(source);
    if (kind === "hsp") return isHspSource(source);
    return isSspHspSource(source);
  };

  const deriveSpecialLeaderboard = (kind) => {
    const base = spreadsheetSnapshot?.specialLeaderboards?.[kind]
      ?? ((kind === "ssp" || kind === "hsp") ? spreadsheetSnapshot?.specialLeaderboards?.["ssp-hsp"] : null)
      ?? null;
    if (kind !== "ssp-hsp" && kind !== "ssp" && kind !== "hsp") {
      return base;
    }

    const specialSources = [...sourceMap.values()]
      .filter((source) => source.approvalStatus === "approved" && isSsphspSource(source, kind));
    if (specialSources.length === 0) {
      return base;
    }

    const byCanonical = new Map();
    for (const source of specialSources) {
      for (const row of source.rows) {
        const player = players.get(row.canonicalName) ?? resolveOrCreatePlayer(row.username);
        const existing = byCanonical.get(player.canonicalName) ?? {
          playerId: player.playerId,
          username: player.username,
          skinFaceUrl: skinFaceUrl(player.username),
          playerFlagUrl: player.flagUrl ?? null,
          lastUpdated: row.lastUpdated,
          blocksMined: 0,
          totalDigs: 0,
          rank: 0,
          sourceServer: source.displayName,
            sourceKey: `${kind}:${player.canonicalName}`,
          sourceCount: 0,
          viewKind: "global",
          sourceId: source.id,
          sourceSlug: source.slug,
            rowKey: `${kind}:${player.canonicalName}`,
          strongestBlocks: 0,
        };
        existing.blocksMined += row.blocksMined;
        existing.totalDigs += row.blocksMined;
        existing.sourceCount += 1;
        existing.lastUpdated = newerTimestamp(existing.lastUpdated, row.lastUpdated);
        if (row.blocksMined >= existing.strongestBlocks) {
          existing.strongestBlocks = row.blocksMined;
          existing.sourceServer = source.displayName;
          existing.sourceId = source.id;
          existing.sourceSlug = source.slug;
        }
        byCanonical.set(player.canonicalName, existing);
      }
    }

    const rows = sortRows([...byCanonical.values()].map(({ strongestBlocks, ...row }) => row));
    const sources = specialSources
      .map((source) => ({
        id: source.id,
        slug: source.slug,
        displayName: source.displayName,
        sourceType: source.sourceType,
        logoUrl: source.logoUrl,
        totalBlocks: source.totalBlocks,
        isDead: source.isDead,
        playerCount: source.rows.length,
          sourceScope: source.sourceScope,
          sourceCategory: source.sourceCategory,
          sourceIdentity: source.sourceIdentity,
          sourceSymbolHash: source.sourceSymbolHash,
          hasSpreadsheetTotal: source.hasSpreadsheetTotal,
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));

    return {
        ...(base ?? {}),
        kind,
        title: kind === "ssp-hsp" ? base?.title ?? "SSP/HSP Leaderboard" : specialLeaderboardLabel(kind),
        description: kind === "hsp"
          ? "Ranking for Hardcore Single Player digs."
          : kind === "ssp"
            ? "Ranking for Single Player Survival digs."
            : base?.description ?? "Single-player and hardcore single-player worlds.",
      sources,
      rows,
      totalBlocks: rows.reduce((sum, row) => sum + Number(row.blocksMined ?? 0), 0),
      playerCount: rows.length,
      generatedAt: new Date().toISOString(),
    };
  };

  const getPlayerByUuid = (rawUuid) => {
    const normalized = normalizeMinecraftUuid(rawUuid);
    if (!normalized) {
      throw new Error("Minecraft UUID format is invalid.");
    }
    const found = [...players.values()].find((player) => normalizeMinecraftUuid(player.uuid) === normalized);
    if (!found) {
      throw new Error("No player was found for that UUID.");
    }
    return found;
  };

  return {
    resolveOrCreatePlayer,

    normalizePlayerName: normalizeCanonicalPlayerName,

    getViewer() {
      const player = players.get(normalizeCanonicalPlayerName(viewer.username)) ?? viewerPlayer;
      return {
        ...viewer,
        username: player.username,
        role: player.role,
        isAdmin: isManagementRole(player.role),
      };
    },

    getPublicSources: derivePublicSources,

    getSpecialLeaderboard(kind) {
      return deriveSpecialLeaderboard(kind);
    },

    getMainRows: deriveMainRows,

    getSourceRows(sourceSlug) {
      return deriveSourceRows(sourceSlug);
    },

    getSiteContent() {
      return { ...siteContent };
    },

    getIdentityDiagnostics() {
      return {
        players: [...players.values()].map((player) => ({
          playerId: player.playerId,
          username: player.username,
          canonicalName: player.canonicalName,
          canonical_name: player.canonical_name,
          role: player.role,
        })),
      };
    },

    getModerationSources() {
      const approvedIds = new Set([...sourceMap.values()].map((source) => source.id));
      for (const source of sourceMap.values()) {
        const existing = moderationById.get(source.id);
        moderationById.set(source.id, {
          ...(existing ?? {
            id: source.id,
            displayName: source.displayName,
            worldKey: source.slug,
            kind: "multiplayer",
            sourceScope: source.sourceScope,
            submittedByUsername: "5hekel",
            submittedAt: new Date().toISOString(),
            firstSeenAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            eligibleForPublic: true,
            scanEvidence: {
              scoreboardTitle: `${source.displayName} Source`,
              sampleSidebarLines: ["Blocks Mined"],
              detectedStatFields: ["blocks_mined"],
              confidence: 0.98,
              iconUrl: source.logoUrl,
              rawScanEvidence: null,
            },
          }),
          displayName: source.displayName,
          worldKey: source.slug,
          totalBlocks: source.totalBlocks,
          playerCount: source.rows.length,
          approvalStatus: source.approvalStatus,
          reviewNote: source.reviewNote ?? existing?.reviewNote ?? null,
        });
      }
      for (const [id] of moderationById.entries()) {
        if (!approvedIds.has(id)) {
          moderationById.delete(id);
        }
      }
      return [...moderationById.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
    },

    lookupRole(uuid) {
      const player = getPlayerByUuid(uuid);
      return {
        ok: true,
        target: {
          uuid: player.uuid,
          username: player.username,
          userId: player.userId,
          playerId: player.playerId,
          role: player.role,
          minecraftUuidHash: player.minecraftUuidHash,
        },
      };
    },

    setRole({ actorRole, actorUserId, uuid, role, reason }) {
      const player = getPlayerByUuid(uuid);
      const ownerCount = [...players.values()].filter((candidate) => candidate.role === "owner").length;
      const nextRole = normalizeAppRole(role);
      const transition = canTransitionRole({
        actorRole,
        targetCurrentRole: player.role,
        nextRole,
        ownerCount,
        isSelf: player.userId === actorUserId,
      });
      if (!transition.ok) {
        throw new Error(transition.reason);
      }
      const before = player.role;
      player.role = nextRole;
      ensureAudit({
        actorRole,
        actionType: "role.set",
        targetType: "user",
        targetId: player.userId,
        reason: sanitizeRejectReason(reason ?? "") || null,
      });
      return {
        ok: true,
        target: {
          uuid: player.uuid,
          username: player.username,
          userId: player.userId,
          playerId: player.playerId,
          role: player.role,
          minecraftUuidHash: player.minecraftUuidHash,
        },
        beforeRole: before,
      };
    },

    lookupFlag(uuid) {
      const player = getPlayerByUuid(uuid);
      return {
        ok: true,
        target: {
          uuid: player.uuid,
          username: player.username,
          playerId: player.playerId,
          userId: player.userId,
          minecraftUuidHash: player.minecraftUuidHash,
          flagCode: player.flagCode,
          flagUrl: player.flagUrl,
        },
      };
    },

    setFlag({ actorRole, uuid, flagCode, reason }) {
      if (!isManagementRole(actorRole)) {
        throw new Error("You do not have permission to manage player flags.");
      }
      const player = getPlayerByUuid(uuid);
      const normalizedFlag = flagCode == null || String(flagCode).trim() === ""
        ? null
        : normalizePlayerFlagCode(flagCode);
      if (flagCode != null && String(flagCode).trim() !== "" && !normalizedFlag) {
        throw new Error("Flag code must be a 2-letter country code.");
      }
      player.flagCode = normalizedFlag;
      player.flagUrl = normalizedFlag ? `/generated/world-flags/${normalizedFlag}.png` : null;
      ensureAudit({
        actorRole,
        actionType: normalizedFlag ? "player.flag.set" : "player.flag.remove",
        targetType: "player",
        targetId: player.playerId,
        reason: sanitizeRejectReason(reason ?? "") || null,
      });
      return this.lookupFlag(uuid);
    },

    updateSourceModeration({ actorRole, sourceId, action, reason }) {
      if (!isManagementRole(actorRole)) {
        throw new Error("You do not have permission to moderate sources.");
      }
      const source = [...sourceMap.values()].find((entry) => entry.id === sourceId);
      if (!source) {
        throw new Error("Source not found.");
      }
      if (action === "delete") {
        sourceMap.delete(source.slug);
      } else {
        source.approvalStatus = action;
        source.reviewNote = action === "rejected" ? sanitizeRejectReason(reason ?? "") || null : null;
      }
      ensureAudit({
        actorRole,
        actionType: `source.${action}`,
        targetType: "source",
        targetId: sourceId,
        reason: sanitizeRejectReason(reason ?? "") || null,
      });
      return {
        ok: true,
        sources: this.getModerationSources(),
        minimumBlocks: 0,
      };
    },

    searchEditableSources(query) {
      const search = sanitizeEditableText(query, 80).toLowerCase();
      return {
        ok: true,
        sources: derivePublicSources().filter((source) =>
          !search || source.displayName.toLowerCase().includes(search) || source.slug.includes(search),
        ),
      };
    },

    getEditableSourceRows(sourceId, query = "") {
      const source = [...sourceMap.values()].find((entry) => entry.id === sourceId);
      if (!source) {
        throw new Error("Source not found.");
      }
      const search = sanitizeEditableText(query, 80).toLowerCase();
      return {
        ok: true,
        rows: sortRows(source.rows)
          .filter((row) => !search || row.username.toLowerCase().includes(search) || row.canonicalName.includes(search))
          .map((row) => {
            const player = players.get(row.canonicalName);
            return {
              playerId: player?.playerId ?? row.playerId,
              username: player?.username ?? row.username,
              minecraftUuidHash: player?.minecraftUuidHash ?? null,
              blocksMined: row.blocksMined,
              lastUpdated: row.lastUpdated,
              flagUrl: player?.flagUrl ?? null,
            };
          }),
      };
    },

    listEditableSinglePlayers(query = "") {
      const search = sanitizeEditableText(query, 80).toLowerCase();
      const sourceTotalsByPlayer = deriveSourceTotalsByPlayer();
      const playersByCanonical = new Map();

      for (const row of deriveMainRows()) {
        const player = players.get(normalizeCanonicalPlayerName(row.username));
        const canonicalName = player?.canonicalName ?? normalizeCanonicalPlayerName(row.username);
        if (search && !String(player?.username ?? row.username).toLowerCase().includes(search)) continue;
        playersByCanonical.set(canonicalName, {
          playerId: player?.playerId ?? row.playerId ?? `local-player:${canonicalName}`,
          username: player?.username ?? row.username,
          blocksMined: row.blocksMined,
          rank: row.rank,
          sourceCount: row.sourceCount,
          lastUpdated: row.lastUpdated,
          flagUrl: player?.flagUrl ?? null,
        });
      }

      for (const [canonicalName, sourceTotal] of sourceTotalsByPlayer.entries()) {
        if (playersByCanonical.has(canonicalName)) continue;
        if (search && !sourceTotal.player.username.toLowerCase().includes(search)) continue;
        playersByCanonical.set(canonicalName, {
          playerId: sourceTotal.player.playerId,
          username: sourceTotal.player.username,
          blocksMined: sourceTotal.blocksMined,
          rank: 0,
          sourceCount: sourceTotal.sourceCount,
          lastUpdated: sourceTotal.lastUpdated,
          flagUrl: sourceTotal.player.flagUrl ?? null,
        });
      }

      return {
        ok: true,
        players: sortRows([...playersByCanonical.values()]),
      };
    },

    listEditableSinglePlayerSources(playerId, query = "") {
      const player = [...players.values()].find((candidate) => candidate.playerId === playerId);
      if (!player) {
        return { ok: true, rows: [] };
      }
      const search = sanitizeEditableText(query, 80).toLowerCase();
      const rows = [];
      for (const source of sourceMap.values()) {
        if (source.approvalStatus !== "approved") continue;
        const row = source.rows.find((entry) => entry.canonicalName === player.canonicalName);
        if (!row) continue;
        if (search && !source.displayName.toLowerCase().includes(search) && !source.slug.includes(search)) continue;
        rows.push({
          sourceId: source.id,
          sourceSlug: source.slug,
          sourceName: source.displayName,
          logoUrl: source.logoUrl,
          playerId: player.playerId,
          username: player.username,
          blocksMined: row.blocksMined,
          rank: 0,
          lastUpdated: row.lastUpdated,
          needsManualReview: false,
        });
      }
      return {
        ok: true,
        rows: sortRows(rows),
      };
    },

    updateSource({ actorRole, sourceId, displayName, reason }) {
      if (!isManagementRole(actorRole)) {
        throw new Error("You do not have permission to edit sources.");
      }
      const source = [...sourceMap.values()].find((entry) => entry.id === sourceId);
      if (!source) {
        throw new Error("Source not found.");
      }
      const nextDisplayName = sanitizeEditableText(displayName, 80);
      if (!nextDisplayName) {
        throw new Error("Source name cannot be empty.");
      }
      source.displayName = nextDisplayName;
      ensureAudit({
        actorRole,
        actionType: "source.edit",
        targetType: "source",
        targetId: sourceId,
        reason: sanitizeRejectReason(reason ?? "") || null,
      });
      return {
        ok: true,
        source: {
          id: source.id,
          slug: source.slug,
          displayName: source.displayName,
          sourceType: source.sourceType,
          isPublic: true,
          isApproved: source.approvalStatus === "approved",
        },
      };
    },

    updateSourcePlayer({ actorRole, sourceId, playerId, username, sourceName = null, blocksMined, reason }) {
      if (!isManagementRole(actorRole)) {
        throw new Error("You do not have permission to edit leaderboard rows.");
      }
      const source = [...sourceMap.values()].find((entry) => entry.id === sourceId);
      if (!source) {
        throw new Error("Source not found.");
      }
      const row = source.rows.find((entry) => (players.get(entry.canonicalName)?.playerId ?? entry.playerId) === playerId);
      if (!row) {
        throw new Error("Player source row not found.");
      }
      const previousUsername = row.username;
      const previousCanonicalName = row.canonicalName ?? normalizeCanonicalPlayerName(previousUsername);
      const previousBlocks = row.blocksMined;
      const nextBlocks = parseNonNegativeInteger(blocksMined);
      if (nextBlocks == null) {
        throw new Error("Blocks mined must be a non-negative integer.");
      }
      const nextUsername = username == null ? row.username : cleanPlayerDisplayName(sanitizeEditableText(username, 32));
      if (!nextUsername) {
        throw new Error("Player name cannot be empty.");
      }
      const requestedSourceName = sourceName == null ? null : sanitizeEditableText(sourceName, 80).replace(/\s+/g, " ").trim();
      if (sourceName != null && !requestedSourceName) {
        throw new Error("Source name cannot be empty.");
      }
      const targetPlayer = mergePlayerIdentity(previousCanonicalName, nextUsername);
      const targetRow = source.rows.find((entry) => entry.canonicalName === targetPlayer.canonicalName);
      if (!targetRow) {
        throw new Error("Player source row not found after identity merge.");
      }
      const nextEffectiveBlocks = targetPlayer.canonicalName === previousCanonicalName
        ? nextBlocks
        : Math.max(targetRow.blocksMined, nextBlocks);
      targetRow.username = targetPlayer.username;
      targetRow.playerId = targetPlayer.playerId;
      targetRow.canonicalName = targetPlayer.canonicalName;
      targetRow.blocksMined = nextEffectiveBlocks;

      if (requestedSourceName && requestedSourceName.toLowerCase() !== source.displayName.toLowerCase()) {
        const mergeTarget = [...sourceMap.values()].find((entry) =>
          entry.id !== source.id
          && entry.approvalStatus === "approved"
          && entry.displayName.toLowerCase() === requestedSourceName.toLowerCase()
          && entry.rows.some((candidate) => candidate.canonicalName === targetPlayer.canonicalName)
        );

        if (mergeTarget) {
          const targetSourceRow = mergeTarget.rows.find((entry) => entry.canonicalName === targetPlayer.canonicalName);
          if (!targetSourceRow) {
            throw new Error("Merge target source row not found.");
          }
          targetSourceRow.blocksMined += nextEffectiveBlocks;
          targetSourceRow.lastUpdated = newerTimestamp(targetSourceRow.lastUpdated, targetRow.lastUpdated);
          source.rows = source.rows.filter((entry) => entry !== targetRow);
          source.totalBlocks = source.rows.reduce((sum, entry) => sum + entry.blocksMined, 0);
          mergeTarget.totalBlocks = mergeTarget.rows.reduce((sum, entry) => sum + entry.blocksMined, 0);
          if (source.rows.length === 0) {
            sourceMap.delete(source.slug);
          }
          rebuildMainLeaderboardRowsFromSources();
          ensureAudit({
            actorRole,
            actionType: "leaderboard-entry.merge",
            targetType: "leaderboard-entry",
            targetId: `${sourceId}:${playerId}`,
            reason: sanitizeRejectReason(reason ?? "") || null,
          });
          return {
            ok: true,
            row: {
              sourceId: mergeTarget.id,
              playerId: targetPlayer.playerId,
              username: targetPlayer.username,
              sourceName: mergeTarget.displayName,
              blocksMined: targetSourceRow.blocksMined,
              merged: true,
            },
          };
        }

        source.displayName = requestedSourceName;
      }

      source.totalBlocks = source.rows.reduce((sum, entry) => sum + entry.blocksMined, 0);
      updateMainLeaderboardDelta(targetPlayer.canonicalName, nextEffectiveBlocks - previousBlocks, targetPlayer.username, targetRow.lastUpdated, source);
      rebuildMainLeaderboardRowsFromSources();
      ensureAudit({
        actorRole,
        actionType: "leaderboard-entry.edit",
        targetType: "leaderboard-entry",
        targetId: `${sourceId}:${playerId}`,
        reason: sanitizeRejectReason(reason ?? "") || null,
      });
      return {
        ok: true,
        row: {
          sourceId,
          playerId: targetPlayer.playerId,
          username: targetPlayer.username,
          sourceName: source.displayName,
          blocksMined: nextEffectiveBlocks,
          merged: targetPlayer.canonicalName !== previousCanonicalName,
        },
      };
    },

    createDirectSource({ actorRole, sourceName, sourceType, playerRows, logoUrl = null, reason }) {
      if (!isManagementRole(actorRole)) {
        throw new Error("You do not have permission to create sources.");
      }
      const displayName = sanitizeEditableText(sourceName, 80);
      if (!displayName) {
        throw new Error("Source name cannot be empty.");
      }
      const slug = slugify(displayName);
      const source = sourceMap.get(slug) ?? {
        id: `local-source:${slug}`,
        slug,
        displayName,
        sourceType: sourceType || "server",
        logoUrl,
        isDead: false,
        sourceScope: sourceType === "singleplayer" ? "private_singleplayer" : "public_server",
        hasSpreadsheetTotal: false,
        approvalStatus: "approved",
        reviewNote: null,
        rows: [],
        totalBlocks: 0,
      };
      source.displayName = displayName;
      source.sourceType = sourceType || source.sourceType;
      source.logoUrl = logoUrl ?? source.logoUrl;
      const now = new Date().toISOString();
      for (const playerRow of playerRows ?? []) {
        const player = resolveOrCreatePlayer(playerRow.username);
        const blocks = parseNonNegativeInteger(playerRow.blocksMined);
        if (blocks == null) {
          throw new Error(`Blocks mined for ${player.username} must be a non-negative integer.`);
        }
        const existing = source.rows.find((entry) => entry.canonicalName === player.canonicalName);
        if (existing) {
          const previous = existing.blocksMined;
          existing.blocksMined = Math.max(existing.blocksMined, blocks);
          existing.username = player.username;
          existing.playerId = player.playerId;
          updateMainLeaderboardDelta(player.canonicalName, existing.blocksMined - previous, player.username, now, source);
        } else {
          source.rows.push({
            playerId: player.playerId,
            username: player.username,
            canonicalName: player.canonicalName,
            blocksMined: blocks,
            lastUpdated: now,
          });
          updateMainLeaderboardDelta(player.canonicalName, blocks, player.username, now, source);
        }
      }
      removeDuplicateRowsInSource(source);
      sourceMap.set(slug, source);
      rebuildMainLeaderboardRowsFromSources();
      ensureAudit({
        actorRole,
        actionType: "source.create-direct",
        targetType: "source",
        targetId: source.id,
        reason: sanitizeRejectReason(reason ?? "") || null,
      });
      return {
        ok: true,
        sources: this.getModerationSources(),
        minimumBlocks: 0,
      };
    },

    applySyncContribution({ sourceName, sourceType = "server", username, blocksMined, blocksMinedDelta = null }) {
      const player = resolveOrCreatePlayer(username);
      const displayName = sanitizeEditableText(sourceName, 80);
      if (!displayName) {
        throw new Error("Source name cannot be empty.");
      }
      const slug = slugify(displayName);
      const now = new Date().toISOString();
      const source = sourceMap.get(slug) ?? {
        id: `local-source:${slug}`,
        slug,
        displayName,
        sourceType,
        logoUrl: null,
        isDead: false,
        sourceScope: sourceType === "singleplayer" ? "private_singleplayer" : "public_server",
        hasSpreadsheetTotal: false,
        approvalStatus: "approved",
        reviewNote: null,
        rows: [],
        totalBlocks: 0,
      };
      sourceMap.set(slug, source);

      const row = source.rows.find((entry) => entry.canonicalName === player.canonicalName);
      const previousBlocks = row?.blocksMined ?? 0;
      const absoluteBlocks = blocksMined == null ? null : parseNonNegativeInteger(blocksMined);
      const deltaBlocks = blocksMinedDelta == null ? null : parseNonNegativeInteger(blocksMinedDelta);
      if (absoluteBlocks == null && deltaBlocks == null) {
        throw new Error("Sync must include blocksMined or blocksMinedDelta.");
      }
      const nextBlocks = absoluteBlocks ?? previousBlocks + (deltaBlocks ?? 0);
      if (row) {
        row.username = player.username;
        row.playerId = player.playerId;
        row.blocksMined = nextBlocks;
        row.lastUpdated = now;
      } else {
        source.rows.push({
          playerId: player.playerId,
          username: player.username,
          canonicalName: player.canonicalName,
          blocksMined: nextBlocks,
          lastUpdated: now,
        });
      }
      removeDuplicateRowsInSource(source);
      updateMainLeaderboardDelta(player.canonicalName, nextBlocks - previousBlocks, player.username, now, source);
      rebuildMainLeaderboardRowsFromSources();
      return {
        ok: true,
        player: {
          playerId: player.playerId,
          username: player.username,
          canonicalName: player.canonicalName,
          canonical_name: player.canonical_name,
        },
        source: {
          id: source.id,
          slug: source.slug,
          displayName: source.displayName,
          totalBlocks: source.totalBlocks,
          playerCount: source.rows.length,
        },
      };
    },

    updateSiteContent({ actorRole, key, value, reason }) {
      if (!isManagementRole(actorRole)) {
        throw new Error("You do not have permission to edit site content.");
      }
      if (!isAllowedSiteContentKey(key)) {
        throw new Error("Unsupported content key.");
      }
      const nextValue = sanitizeSiteContentValue(value);
      if (!nextValue) {
        throw new Error("Content value cannot be empty.");
      }
      siteContent[key] = nextValue;
      ensureAudit({
        actorRole,
        actionType: "site-content.set",
        targetType: "site-content",
        targetId: key,
        reason: sanitizeRejectReason(reason ?? "") || null,
      });
      return {
        ok: true,
        content: this.getSiteContent(),
      };
    },

    getAuditEntries() {
      return {
        ok: true,
        entries: [...auditEntries],
      };
    },
  };
}
