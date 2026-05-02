import type {
  AdminAuditEntrySummary,
  AdminFlagResponse,
  AdminRoleLookupResponse,
  AppRole,
  EditableSinglePlayerSummary,
  EditableSinglePlayerSourceSummary,
  EditableSourceRowSummary,
  EditableSourceSummary,
  SiteContentResponse,
  SourceApprovalSummary,
} from "@/lib/types";
import { LEGACY_CSRF_COOKIE } from "@/lib/legacy-auth-cookies";
import { apiCredentials, apiUrl, isLocalProductionPreview, logLocalApiFailure, readResponseBody } from "@/lib/local-runtime";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    // fall through
  }

  return fallback;
}

function adminHeaders() {
  const csrfToken = getCookie(LEGACY_CSRF_COOKIE);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
  };
}

export async function fetchSiteContent(): Promise<SiteContentResponse> {
  if (isLocalProductionPreview()) {
    try {
      const response = await fetch(apiUrl("/api/site-content"), {
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        return (await response.json()) as SiteContentResponse;
      }
      logLocalApiFailure("Local site content", {
        url: apiUrl("/api/site-content"),
        status: response.status,
        body: await readResponseBody(response),
      });
    } catch (error) {
      logLocalApiFailure("Local site content", {
        url: apiUrl("/api/site-content"),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { content: {} };
  }

  const response = await fetch(apiUrl("/api/site-content"), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    logLocalApiFailure("Site content", {
      url: "/api/site-content",
      status: response.status,
      body: await readResponseBody(response),
    });
    return { content: {} };
  }

  return (await response.json()) as SiteContentResponse;
}

export async function fetchRoleByUuid(uuid: string) {
  const response = await fetch(apiUrl(`/api/admin/roles?uuid=${encodeURIComponent(uuid)}`), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to look up role."));
  }

  return (await response.json()) as AdminRoleLookupResponse;
}

export async function setRoleByUuid(uuid: string, role: AppRole, reason?: string) {
  const response = await fetch(apiUrl("/api/admin/roles"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({ uuid, role, reason: reason?.trim() || null }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update role."));
  }

  return (await response.json()) as AdminRoleLookupResponse;
}

export async function fetchFlagByUuid(uuid: string) {
  const response = await fetch(apiUrl(`/api/admin/flags?uuid=${encodeURIComponent(uuid)}`), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to look up player flag."));
  }

  return (await response.json()) as AdminFlagResponse;
}

export async function setFlagByUuid(uuid: string, flagCode: string | null, reason?: string) {
  const response = await fetch(apiUrl("/api/admin/flags"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({ uuid, flagCode, reason: reason?.trim() || null }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update player flag."));
  }

  return (await response.json()) as AdminFlagResponse;
}

export async function fetchEditableSources(query: string) {
  const response = await fetch(apiUrl(`/api/admin/editor?kind=sources&query=${encodeURIComponent(query)}&limit=80`), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to search editable sources."));
  }

  return (await response.json()) as { ok: true; sources: EditableSourceSummary[] };
}

export async function fetchEditableSourceRows(sourceId: string, query = "") {
  const response = await fetch(apiUrl(`/api/admin/editor?kind=source-rows&sourceId=${encodeURIComponent(sourceId)}&query=${encodeURIComponent(query)}&limit=120`), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to load editable source rows."));
  }

  return (await response.json()) as { ok: true; rows: EditableSourceRowSummary[] };
}

export async function fetchEditableSinglePlayers(query: string, limit = 80) {
  const response = await fetch(apiUrl(`/api/admin/editor?kind=single-players&query=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to load editable single players."));
  }

  return (await response.json()) as { ok: true; players: EditableSinglePlayerSummary[] };
}

export async function fetchEditableSinglePlayerSources(playerId: string, query = "") {
  const response = await fetch(apiUrl(`/api/admin/editor?kind=single-player-sources&playerId=${encodeURIComponent(playerId)}&query=${encodeURIComponent(query)}&limit=120`), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to load editable player source rows."));
  }

  return (await response.json()) as { ok: true; rows: EditableSinglePlayerSourceSummary[] };
}

export async function updateEditableSource(sourceId: string, displayName: string, reason?: string, totalBlocks?: number | null, logoUrl?: string | null) {
  const response = await fetch(apiUrl("/api/admin/editor"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({
      action: "update-source",
      sourceId,
      displayName,
      totalBlocks: totalBlocks ?? null,
      logoUrl: logoUrl ?? null,
      reason: reason?.trim() || null,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update source."));
  }

  return (await response.json()) as { ok: true; source: EditableSourceSummary };
}

export async function deleteEditableSource(input: {
  sourceId: string;
  reason?: string;
}) {
  const response = await fetch(apiUrl("/api/admin/editor"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({
      action: "delete-source",
      sourceId: input.sourceId,
      reason: input.reason?.trim() || null,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to delete source."));
  }

  return (await response.json()) as {
    ok: true;
    source: {
      id: string;
      displayName: string;
      deleted: true;
    };
  };
}

export async function updateEditableSinglePlayer(input: {
  playerId: string;
  blocksMined: number;
  flagUrl?: string | null;
  reason?: string;
}) {
  const response = await fetch(apiUrl("/api/admin/editor"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({
      action: "update-single-player",
      ...input,
      reason: input.reason?.trim() || null,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update single player."));
  }

  return (await response.json()) as {
    ok: true;
    player: {
      playerId: string;
      username: string;
      blocksMined: number;
      flagUrl: string | null;
    };
  };
}

export async function renameEditableSinglePlayer(input: {
  playerId: string;
  newUsername: string;
  reason?: string;
}) {
  const response = await fetch(apiUrl("/api/admin/editor"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({
      action: "rename-single-player",
      playerId: input.playerId,
      newUsername: input.newUsername,
      reason: input.reason?.trim() || null,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to rename player."));
  }

  return (await response.json()) as {
    ok: true;
    player: {
      playerId: string;
      previousUsername: string;
      username: string;
      blocksMined: number;
      sourceCount: number;
    };
  };
}

export async function deleteEditableSinglePlayer(input: {
  playerId: string;
  username: string;
  reason?: string;
}) {
  const response = await fetch(apiUrl("/api/admin/editor"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({
      action: "delete-single-player",
      playerId: input.playerId,
      username: input.username,
      reason: input.reason?.trim() || null,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to delete player."));
  }

  return (await response.json()) as {
    ok: true;
    player: {
      playerId: string;
      username: string;
      deleted: true;
    };
  };
}

export async function updateEditableSourcePlayer(input: {
  sourceId: string;
  playerId: string | null;
  username?: string | null;
  blocksMined: number;
  sourceName?: string | null;
  createIfMissing?: boolean;
  reason?: string;
}) {
  const response = await fetch(apiUrl("/api/admin/editor"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({
      action: input.createIfMissing || !input.playerId ? "upsert-source-player" : "update-source-player",
      ...input,
      reason: input.reason?.trim() || null,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update player row."));
  }

  return (await response.json()) as {
    ok: true;
    row: {
      sourceId: string;
      playerId: string;
      username: string;
      sourceName?: string;
      blocksMined: number;
      merged?: boolean;
    };
  };
}

export async function updateSiteContentValue(key: string, value: string, reason?: string) {
  const response = await fetch(apiUrl("/api/admin/editor"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({
      action: "update-site-content",
      key,
      value,
      reason: reason?.trim() || null,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update site content."));
  }

  return (await response.json()) as SiteContentResponse & { ok: true };
}

export async function fetchAdminAuditEntries() {
  const response = await fetch(apiUrl("/api/admin/editor?kind=audit"), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to load audit entries."));
  }

  return (await response.json()) as { ok: true; entries: AdminAuditEntrySummary[] };
}

export async function fetchSourceApprovals() {
  const response = await fetch(apiUrl("/api/admin/sources"), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to load source approvals."));
  }

  return (await response.json()) as {
    sources: SourceApprovalSummary[];
    minimumBlocks: number;
  };
}

export async function updateSourceApproval(sourceId: string, action: "approved" | "rejected", reason?: string) {
  const response = await fetch(apiUrl("/api/admin/sources"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({ sourceId, action, reason: reason?.trim() || null }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update source approval."));
  }

  return (await response.json()) as {
    ok: true;
    sources: SourceApprovalSummary[];
    minimumBlocks: number;
  };
}

export async function deleteSource(sourceId: string, reason?: string) {
  const response = await fetch(apiUrl("/api/admin/sources"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: adminHeaders(),
    body: JSON.stringify({ sourceId, action: "delete", reason: reason?.trim() || null }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to delete source."));
  }

  return (await response.json()) as {
    ok: true;
    sources: SourceApprovalSummary[];
    minimumBlocks: number;
  };
}
