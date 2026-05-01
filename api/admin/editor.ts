import {
  AdminActionError,
  listEditableSourceRows,
  listEditableSinglePlayers,
  listEditableSinglePlayerSources,
  listRecentAuditEntries,
  searchEditableSources,
  setSiteContentValue,
  deleteEditableSinglePlayer,
  renameEditableSinglePlayer,
  updateEditableSource,
  updateEditableSourcePlayer,
  upsertEditableSourcePlayer,
  updateEditableSinglePlayer,
} from "../_lib/admin-management.js";
import { getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError } from "../_lib/server.js";
import { refreshStaticManualOverridesSnapshot } from "../_lib/static-mmm-overrides.js";
import { invalidateDashboardSnapshotCache } from "../_lib/dashboard.js";

export const config = { runtime: "edge" };

function response(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  return jsonResponse(body, { ...init, headers });
}

function limitParam(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  return Math.min(max, Math.max(1, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

export default async function handler(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return response({ error: "Authentication required." }, { status: 401 });
    }

    const url = new URL(request.url);

    if (request.method === "GET") {
      const kind = url.searchParams.get("kind") ?? "";
      const limit = limitParam(url.searchParams.get("limit"), 80, 200);
      const playerPickerLimit = limitParam(url.searchParams.get("limit"), 80, 10000);
      if (kind === "sources") {
        return response(await searchEditableSources(auth, url.searchParams.get("query") ?? "", limit));
      }
      if (kind === "source-rows") {
        const sourceId = url.searchParams.get("sourceId") ?? "";
        if (!sourceId) {
          return response({ error: "sourceId is required." }, { status: 400 });
        }
        return response(await listEditableSourceRows(auth, sourceId, url.searchParams.get("query") ?? "", limit));
      }
      if (kind === "single-players") {
        return response(await listEditableSinglePlayers(auth, url.searchParams.get("query") ?? "", playerPickerLimit));
      }
      if (kind === "single-player-sources") {
        const playerId = url.searchParams.get("playerId") ?? "";
        if (!playerId) {
          return response({ error: "playerId is required." }, { status: 400 });
        }
        return response(await listEditableSinglePlayerSources(auth, playerId, url.searchParams.get("query") ?? "", limit));
      }
      if (kind === "audit") {
        return response(await listRecentAuditEntries(auth));
      }
      return response({ error: "Unsupported editor query." }, { status: 400 });
    }

    if (request.method !== "POST") {
      return response({ error: "Method not allowed." }, { status: 405 });
    }

    if (!(await requireCsrf(request, auth))) {
      return response({ error: "CSRF validation failed." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          action?: "update-source";
          sourceId?: string;
          displayName?: string;
          totalBlocks?: number | null;
          logoUrl?: string | null;
          reason?: string | null;
        }
      | {
          action?: "update-source-player" | "upsert-source-player";
          sourceId?: string;
          playerId?: string | null;
          username?: string | null;
          blocksMined?: number;
          sourceName?: string | null;
          createIfMissing?: boolean;
          reason?: string | null;
        }
      | {
          action?: "update-single-player";
          playerId?: string;
          blocksMined?: number;
          flagUrl?: string | null;
          reason?: string | null;
        }
      | {
          action?: "rename-single-player";
          playerId?: string;
          newUsername?: string;
          reason?: string | null;
        }
      | {
          action?: "delete-single-player";
          playerId?: string;
          username?: string;
          reason?: string | null;
        }
      | {
          action?: "update-site-content";
          key?: string;
          value?: string;
          reason?: string | null;
        }
      | null;

    if (!body?.action) {
      return response({ error: "Action is required." }, { status: 400 });
    }

    if (body.action === "update-source") {
      if (!body.sourceId || typeof body.displayName !== "string") {
        return response({ error: "sourceId and displayName are required." }, { status: 400 });
      }
      const result = await updateEditableSource(auth, {
        sourceId: body.sourceId,
        displayName: body.displayName,
        totalBlocks: body.totalBlocks ?? null,
        logoUrl: body.logoUrl ?? null,
        reason: body.reason ?? null,
      });
      await refreshStaticManualOverridesSnapshot();
      invalidateDashboardSnapshotCache();
      return response(result);
    }

    if (body.action === "update-source-player") {
      if (!body.sourceId || !body.playerId || typeof body.blocksMined !== "number") {
        return response({ error: "sourceId, playerId, and blocksMined are required." }, { status: 400 });
      }
      const result = await updateEditableSourcePlayer(auth, {
        sourceId: body.sourceId,
        playerId: body.playerId,
        username: body.username ?? null,
        blocksMined: body.blocksMined,
        sourceName: body.sourceName ?? null,
        reason: body.reason ?? null,
      });
      await refreshStaticManualOverridesSnapshot();
      invalidateDashboardSnapshotCache();
      return response(result);
    }

    if (body.action === "upsert-source-player") {
      if (!body.sourceId || typeof body.blocksMined !== "number") {
        return response({ error: "sourceId and blocksMined are required." }, { status: 400 });
      }
      const result = await upsertEditableSourcePlayer(auth, {
        sourceId: body.sourceId,
        playerId: body.playerId ?? null,
        username: body.username ?? null,
        blocksMined: body.blocksMined,
        sourceName: body.sourceName ?? null,
        createIfMissing: body.createIfMissing === true,
        reason: body.reason ?? null,
      });
      await refreshStaticManualOverridesSnapshot();
      invalidateDashboardSnapshotCache();
      return response(result);
    }

    if (body.action === "update-single-player") {
      if (!body.playerId || typeof body.blocksMined !== "number") {
        return response({ error: "playerId and blocksMined are required." }, { status: 400 });
      }
      const result = await updateEditableSinglePlayer(auth, {
        playerId: body.playerId,
        blocksMined: body.blocksMined,
        flagUrl: body.flagUrl ?? null,
        reason: body.reason ?? null,
      });
      await refreshStaticManualOverridesSnapshot();
      invalidateDashboardSnapshotCache();
      return response(result);
    }

    if (body.action === "rename-single-player") {
      if (!body.playerId || typeof body.newUsername !== "string") {
        return response({ error: "playerId and newUsername are required." }, { status: 400 });
      }
      const result = await renameEditableSinglePlayer(auth, {
        playerId: body.playerId,
        newUsername: body.newUsername,
        reason: body.reason ?? null,
      });
      await refreshStaticManualOverridesSnapshot();
      invalidateDashboardSnapshotCache();
      return response(result);
    }

    if (body.action === "delete-single-player") {
      if (!body.playerId || typeof body.username !== "string") {
        return response({ error: "playerId and username are required." }, { status: 400 });
      }
      const result = await deleteEditableSinglePlayer(auth, {
        playerId: body.playerId,
        username: body.username,
        reason: body.reason ?? null,
      });
      await refreshStaticManualOverridesSnapshot();
      invalidateDashboardSnapshotCache();
      return response(result);
    }

    if (body.action === "update-site-content") {
      if (typeof body.key !== "string" || typeof body.value !== "string") {
        return response({ error: "key and value are required." }, { status: 400 });
      }
      return response(await setSiteContentValue(auth, {
        key: body.key,
        value: body.value,
        reason: body.reason ?? null,
      }));
    }

    return response({ error: "Unsupported editor action." }, { status: 400 });
  } catch (error) {
    if (error instanceof AdminActionError) {
      return response({ error: error.message }, { status: error.status });
    }
    logServerError("admin-editor failed", error);
    return response({ error: "Unable to update admin editor data." }, { status: 500 });
  }
}
