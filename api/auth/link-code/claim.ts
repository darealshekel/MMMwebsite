import { claimModLinkCode, LinkCodeError } from "../../_lib/mod-link.js";
import { jsonResponse, rateLimitRequest } from "../../_lib/server.js";

export const config = { runtime: "edge" };

type ClaimBody = {
  code?: string;
  minecraftUuid?: string;
  minecraft_uuid?: string;
  username?: string;
  clientId?: string | null;
  client_id?: string | null;
};

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const allowed = await rateLimitRequest(request, "mod-link-claim", "mod", 60, 10 * 60 * 1000);
    if (!allowed) {
      return jsonResponse({ error: "Too many link attempts." }, { status: 429 });
    }

    const body = await request.json().catch(() => null) as ClaimBody | null;
    const minecraftUuid = body?.minecraftUuid ?? body?.minecraft_uuid;
    const clientId = body?.clientId ?? body?.client_id ?? null;

    if (!body?.code || !minecraftUuid || !body.username) {
      return jsonResponse({ error: "Missing code, username, or Minecraft UUID." }, { status: 400 });
    }

    const result = await claimModLinkCode({
      code: body.code,
      minecraftUuid,
      username: body.username,
      clientId,
    });

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof LinkCodeError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not claim link code." }, { status: 500 });
  }
}
