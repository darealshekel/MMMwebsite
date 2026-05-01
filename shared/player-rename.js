import { canonicalPlayerName, cleanPlayerDisplayName } from "./player-identity.js";

function cleanRenameDisplayName(value) {
  return cleanPlayerDisplayName(value).slice(0, 32);
}

export function canonicalNameFromPlayerId(playerId) {
  const raw = String(playerId ?? "").trim();
  if (!raw) return "";
  if (raw === "local-owner-player") return "5hekel";
  return canonicalPlayerName(raw.replace(/^sheet:/i, "").replace(/^local-player:/i, ""));
}

export function cleanPlayerRenameName(value) {
  return cleanRenameDisplayName(value);
}

export function buildPlayerRenameIndexes(singlePlayerOverrides) {
  const byPlayerId = new Map();
  const byCanonicalName = new Map();

  for (const [playerId, rawOverride] of singlePlayerOverrides.entries()) {
    const override = rawOverride && typeof rawOverride === "object" && !Array.isArray(rawOverride)
      ? rawOverride
      : {};
    const renamed = cleanRenameDisplayName(
      override.username ?? override.newUsername ?? override.renamedTo,
    );
    if (!renamed) continue;

    byPlayerId.set(String(playerId), renamed);

    const oldCandidates = [
      override.previousUsername,
      override.oldUsername,
      override.originalUsername,
      override.canonicalOldName,
      canonicalNameFromPlayerId(playerId),
    ];
    for (const candidate of oldCandidates) {
      const key = canonicalPlayerName(candidate);
      if (key) byCanonicalName.set(key, renamed);
    }
  }

  return { byPlayerId, byCanonicalName };
}

export function resolveRenamedPlayerName(renameIndexes, playerId, username) {
  const id = String(playerId ?? "");
  if (id && renameIndexes.byPlayerId.has(id)) {
    return renameIndexes.byPlayerId.get(id);
  }

  const usernameKey = canonicalPlayerName(username);
  if (usernameKey && renameIndexes.byCanonicalName.has(usernameKey)) {
    return renameIndexes.byCanonicalName.get(usernameKey);
  }

  const idKey = canonicalNameFromPlayerId(id);
  if (idKey && renameIndexes.byCanonicalName.has(idKey)) {
    return renameIndexes.byCanonicalName.get(idKey);
  }

  return cleanRenameDisplayName(username);
}

export function hasPlayerRename(renameIndexes, playerId, username) {
  const current = cleanRenameDisplayName(username);
  const renamed = resolveRenamedPlayerName(renameIndexes, playerId, username);
  return Boolean(renamed && renamed !== current);
}
