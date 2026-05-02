import { sanitizeEditableText } from "../../shared/admin-management.js";
import { canonicalPlayerName, cleanPlayerDisplayName } from "../../shared/player-identity.js";
import {
  insertUserIdentity,
  selectUserIdentityByCanonicalName,
  selectUserIdentityById,
  selectUserIdentityByUuidHash,
  type UserIdentityRow,
} from "./user-identity.js";

type ResolvedPlayer = {
  id: string;
  username: string;
  canonicalName: string;
  created: boolean;
};

function cleanResolvedPlayerName(value: unknown) {
  return cleanPlayerDisplayName(sanitizeEditableText(String(value ?? ""), 64)).slice(0, 32);
}

function canonicalResolvedPlayerName(value: unknown) {
  return canonicalPlayerName(cleanResolvedPlayerName(value));
}

export async function resolveExistingPlayerBeforeCreate({
  selectedPlayerId,
  username,
  minecraftUuidHash,
  now = new Date().toISOString(),
  clientId,
  createIfMissing = true,
}: {
  selectedPlayerId?: string | null;
  username: unknown;
  minecraftUuidHash?: string | null;
  now?: string;
  clientId?: string | null;
  createIfMissing?: boolean;
}): Promise<ResolvedPlayer | null> {
  const selectedId = sanitizeEditableText(selectedPlayerId ?? "", 120);
  let selectedPlayer: UserIdentityRow | null = null;

  if (selectedId) {
    const byId = await selectUserIdentityById(selectedId);
    if (byId.error) throw byId.error;
    if (byId.data?.id) {
      selectedPlayer = byId.data;
    }
  }

  const cleanUsername = cleanResolvedPlayerName(username) || cleanResolvedPlayerName(selectedPlayer?.username ?? "");
  const canonicalName = canonicalResolvedPlayerName(cleanUsername || selectedPlayer?.canonical_name || selectedPlayer?.username_lower || selectedPlayer?.username);

  if (!cleanUsername || !canonicalName) {
    return selectedPlayer?.id
      ? {
          id: String(selectedPlayer.id),
          username: cleanResolvedPlayerName(selectedPlayer.username ?? selectedPlayer.id),
          canonicalName: canonicalPlayerName(selectedPlayer.canonical_name ?? selectedPlayer.username_lower ?? selectedPlayer.username ?? selectedPlayer.id),
          created: false,
        }
      : null;
  }

  const uuidHash = sanitizeEditableText(minecraftUuidHash ?? "", 180);
  if (uuidHash) {
    const byUuid = await selectUserIdentityByUuidHash(uuidHash);
    if (byUuid.error) throw byUuid.error;
    if (byUuid.data?.id) {
      return {
        id: String(byUuid.data.id),
        username: cleanResolvedPlayerName(byUuid.data.username ?? cleanUsername),
        canonicalName: canonicalPlayerName(byUuid.data.canonical_name ?? byUuid.data.username_lower ?? byUuid.data.username ?? cleanUsername),
        created: false,
      };
    }
  }

  const byCanonicalName = await selectUserIdentityByCanonicalName(canonicalName);
  if (byCanonicalName.error) throw byCanonicalName.error;
  if (byCanonicalName.data?.id) {
    return {
      id: String(byCanonicalName.data.id),
      username: cleanResolvedPlayerName(byCanonicalName.data.username ?? cleanUsername),
      canonicalName,
      created: false,
    };
  }

  if (selectedPlayer?.id) {
    return {
      id: String(selectedPlayer.id),
      username: cleanResolvedPlayerName(selectedPlayer.username ?? cleanUsername),
      canonicalName,
      created: false,
    };
  }

  if (!createIfMissing) {
    return null;
  }

  const inserted = await insertUserIdentity({
    clientId: clientId || `mmm-player:${canonicalName}`,
    username: cleanUsername,
    canonicalName,
    minecraftUuidHash: uuidHash || null,
    now,
  });

  if (!inserted.error && inserted.data?.id) {
    return {
      id: String(inserted.data.id),
      username: cleanResolvedPlayerName(inserted.data.username ?? cleanUsername),
      canonicalName,
      created: true,
    };
  }

  const retryByCanonicalName = await selectUserIdentityByCanonicalName(canonicalName);
  if (retryByCanonicalName.error) throw retryByCanonicalName.error;
  if (retryByCanonicalName.data?.id) {
    return {
      id: String(retryByCanonicalName.data.id),
      username: cleanResolvedPlayerName(retryByCanonicalName.data.username ?? cleanUsername),
      canonicalName,
      created: false,
    };
  }

  throw inserted.error;
}
