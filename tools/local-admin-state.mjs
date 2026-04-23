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

function skinFaceUrl(username) {
  return `https://minotar.net/avatar/${encodeURIComponent(username)}/32`;
}

function fakeUuidForUsername(username) {
  const hex = crypto.createHash("md5").update(`mmm-local:${username.toLowerCase()}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
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
  return {
    uuid: fakeUuidForUsername(username),
    minecraftUuidHash: `local:${fakeUuidForUsername(username)}`,
    username,
    role: "player",
    flagCode: null,
    flagUrl: playerFlagUrl,
    userId: `local-user:${username.toLowerCase()}`,
    playerId: `local-player:${username.toLowerCase()}`,
  };
}

export function createLocalAdminState({ spreadsheetSnapshot, publicSources, mainRows, adminSources, viewer }) {
  const players = new Map();
  const sourceMap = new Map();
  const mainLeaderboardRows = [];
  const auditEntries = [];
  const siteContent = {};
  let auditId = 1;

  const ensurePlayer = (username, initialFlagUrl = null) => {
    const key = username.toLowerCase();
    const existing = players.get(key);
    if (existing) {
      if (!existing.flagUrl && initialFlagUrl) {
        existing.flagUrl = initialFlagUrl;
      }
      return existing;
    }
    const created = buildRegistryEntry(username, initialFlagUrl);
    players.set(key, created);
    return created;
  };

  const seedSources = spreadsheetSnapshot?.sources ?? [];
  for (const source of seedSources) {
    const rows = sortRows(
      (source.rows ?? []).map((row) => {
        const player = ensurePlayer(row.username, row.playerFlagUrl ?? null);
        return {
          playerId: player.playerId,
          username: player.username,
          blocksMined: Number(row.blocksMined ?? 0),
          lastUpdated: row.lastUpdated,
        };
      }),
    );

    sourceMap.set(source.slug, {
      id: source.id,
      slug: source.slug,
      displayName: source.displayName,
      sourceType: source.sourceType,
      logoUrl: source.logoUrl ?? null,
      isDead: Boolean(source.isDead),
      sourceScope: source.sourceScope ?? "digs_logo_only",
      hasSpreadsheetTotal: Boolean(source.hasSpreadsheetTotal),
      approvalStatus: "approved",
      reviewNote: null,
      rows,
      totalBlocks: Number(source.totalBlocks ?? rows.reduce((sum, row) => sum + row.blocksMined, 0)),
    });
  }

  for (const row of mainRows ?? []) {
    const player = ensurePlayer(row.username, row.playerFlagUrl ?? null);
    mainLeaderboardRows.push({
      playerId: row.playerId ?? player.playerId,
      username: player.username,
      lastUpdated: row.lastUpdated,
      blocksMined: Number(row.blocksMined ?? 0),
      totalDigs: Number(row.totalDigs ?? row.blocksMined ?? 0),
      sourceCount: Number(row.sourceCount ?? 0),
      sourceServer: row.sourceServer ?? null,
      sourceId: row.sourceId ?? null,
      sourceSlug: row.sourceSlug ?? null,
    });
  }

  const viewerPlayer = ensurePlayer(viewer.username, null);
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
        hasSpreadsheetTotal: source.hasSpreadsheetTotal,
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const deriveSourceRows = (sourceSlug) => {
    const source = sourceMap.get(sourceSlug);
    if (!source || source.approvalStatus !== "approved") {
      return null;
    }
    return sortRows(source.rows).map((row) => {
      const player = players.get(row.username.toLowerCase());
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
        sourceKey: `${source.slug}:${(player?.username ?? row.username).toLowerCase()}`,
        sourceCount: 1,
        viewKind: "source",
        sourceId: source.id,
        sourceSlug: source.slug,
        rowKey: `${source.slug}:${(player?.username ?? row.username).toLowerCase()}`,
      };
    });
  };

  const deriveMainRows = () =>
    sortRows(mainLeaderboardRows.map((row) => ({ ...row }))).map((row) => {
      const player = players.get(row.username.toLowerCase());
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
        rowKey: `global:${row.username.toLowerCase()}`,
      };
    });

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
    getViewer() {
      const player = players.get(viewer.username.toLowerCase()) ?? viewerPlayer;
      return {
        ...viewer,
        role: player.role,
        isAdmin: isManagementRole(player.role),
      };
    },

    getPublicSources: derivePublicSources,

    getSpecialLeaderboard(kind) {
      return spreadsheetSnapshot?.specialLeaderboards?.[kind] ?? null;
    },

    getMainRows: deriveMainRows,

    getSourceRows(sourceSlug) {
      return deriveSourceRows(sourceSlug);
    },

    getSiteContent() {
      return { ...siteContent };
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
          .filter((row) => !search || row.username.toLowerCase().includes(search))
          .map((row) => {
            const player = players.get(row.username.toLowerCase());
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

    updateSourcePlayer({ actorRole, sourceId, playerId, username, blocksMined, reason }) {
      if (!isManagementRole(actorRole)) {
        throw new Error("You do not have permission to edit leaderboard rows.");
      }
      const source = [...sourceMap.values()].find((entry) => entry.id === sourceId);
      if (!source) {
        throw new Error("Source not found.");
      }
      const row = source.rows.find((entry) => (players.get(entry.username.toLowerCase())?.playerId ?? entry.playerId) === playerId);
      if (!row) {
        throw new Error("Player source row not found.");
      }
      const previousUsername = row.username;
      const previousUsernameKey = previousUsername.toLowerCase();
      const previousBlocks = row.blocksMined;
      const nextBlocks = parseNonNegativeInteger(blocksMined);
      if (nextBlocks == null) {
        throw new Error("Blocks mined must be a non-negative integer.");
      }
      const nextUsername = username == null ? row.username : sanitizeEditableText(username, 32);
      if (!nextUsername) {
        throw new Error("Player name cannot be empty.");
      }
      const nextUsernameKey = nextUsername.toLowerCase();
      if (nextUsernameKey !== previousUsernameKey && players.has(nextUsernameKey)) {
        throw new Error("Player name already exists.");
      }
      const matchingMainRows = mainLeaderboardRows.filter((entry) => entry.username.toLowerCase() === previousUsernameKey);
      const targetMainRow = matchingMainRows.find((entry) => entry.username === previousUsername) ?? matchingMainRows[0] ?? null;
      if (nextUsernameKey !== previousUsernameKey) {
        const player = players.get(previousUsernameKey);
        if (player) {
          players.delete(previousUsernameKey);
          player.username = nextUsername;
          players.set(nextUsernameKey, player);
        }
        for (const sourceEntry of sourceMap.values()) {
          for (const sourceRow of sourceEntry.rows) {
            if (sourceRow.username.toLowerCase() === previousUsernameKey) {
              sourceRow.username = nextUsername;
            }
          }
        }
        if (targetMainRow) {
          targetMainRow.username = nextUsername;
        }
      }
      row.username = nextUsername;
      row.blocksMined = nextBlocks;
      source.totalBlocks = source.rows.reduce((sum, entry) => sum + entry.blocksMined, 0);
      if (targetMainRow) {
        const delta = nextBlocks - previousBlocks;
        targetMainRow.username = nextUsername;
        targetMainRow.blocksMined += delta;
        targetMainRow.totalDigs += delta;
        targetMainRow.lastUpdated = row.lastUpdated;
      }
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
          playerId,
          username: nextUsername,
          blocksMined: nextBlocks,
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
