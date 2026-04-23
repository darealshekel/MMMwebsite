import { lookupPlayerFlagByUuid, setPlayerFlagByUuid, AdminActionError } from "../_lib/admin-management.js";
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
      const uuid = url.searchParams.get("uuid") ?? "";
      if (!uuid.trim()) {
        return response({ error: "UUID is required." }, { status: 400 });
      }
      return response(await lookupPlayerFlagByUuid(auth, uuid));
    }

    if (request.method !== "POST") {
      return response({ error: "Method not allowed." }, { status: 405 });
    }

    if (!(await requireCsrf(request, auth))) {
      return response({ error: "CSRF validation failed." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      uuid?: string;
      flagCode?: string | null;
      reason?: string | null;
    } | null;

    if (!body?.uuid) {
      return response({ error: "UUID is required." }, { status: 400 });
    }

    return response(await setPlayerFlagByUuid(auth, body));
  } catch (error) {
    if (error instanceof AdminActionError) {
      return response({ error: error.message }, { status: error.status });
    }
    logServerError("admin-flags failed", error);
    return response({ error: "Unable to manage player flags." }, { status: 500 });
  }
}
