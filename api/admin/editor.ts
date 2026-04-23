import {
  AdminActionError,
  listEditableSourceRows,
  listRecentAuditEntries,
  searchEditableSources,
  setSiteContentValue,
  updateEditableSource,
  updateEditableSourcePlayer,
} from "../_lib/admin-management.js";
import { getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError } from "../_lib/server.js";

export const config = { runtime: "edge" };

function response(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  return jsonResponse(body, { ...init, headers });
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
      if (kind === "sources") {
        return response(await searchEditableSources(auth, url.searchParams.get("query") ?? ""));
      }
      if (kind === "source-rows") {
        const sourceId = url.searchParams.get("sourceId") ?? "";
        if (!sourceId) {
          return response({ error: "sourceId is required." }, { status: 400 });
        }
        return response(await listEditableSourceRows(auth, sourceId, url.searchParams.get("query") ?? ""));
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
          reason?: string | null;
        }
      | {
          action?: "update-source-player";
          sourceId?: string;
          playerId?: string;
          username?: string | null;
          blocksMined?: number;
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
      return response(await updateEditableSource(auth, {
        sourceId: body.sourceId,
        displayName: body.displayName,
        reason: body.reason ?? null,
      }));
    }

    if (body.action === "update-source-player") {
      if (!body.sourceId || !body.playerId || typeof body.blocksMined !== "number") {
        return response({ error: "sourceId, playerId, and blocksMined are required." }, { status: 400 });
      }
      return response(await updateEditableSourcePlayer(auth, {
        sourceId: body.sourceId,
        playerId: body.playerId,
        username: body.username ?? null,
        blocksMined: body.blocksMined,
        reason: body.reason ?? null,
      }));
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
