import { createModLinkCode } from "../../_lib/mod-link.js";
import { jsonResponse, rateLimitRequest, safeInternalPath } from "../../_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  const allowed = await rateLimitRequest(request, "mod-link-create", "browser", 30, 10 * 60 * 1000);
  if (!allowed) {
    return jsonResponse({ error: "Too many link code requests." }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({})) as { returnTo?: string };
    const challenge = await createModLinkCode(safeInternalPath(body.returnTo, "/dashboard"));
    return jsonResponse(challenge);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not create link code." }, { status: 500 });
  }
}
