import { jsonResponse, rateLimitRequest } from "./_lib/server";
import { getAuthContext } from "./_lib/session";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return jsonResponse({ authenticated: false }, { status: 401 });
    }

    const allowed = await rateLimitRequest(request, "me", "viewer", 120, 5 * 60 * 1000);
    if (!allowed) {
      return jsonResponse({ error: "Too many requests." }, { status: 429 });
    }

    return jsonResponse({
      authenticated: true,
      user: {
        id: auth.userId,
        username: auth.viewer.minecraftUsername,
        avatarUrl: auth.viewer.avatarUrl,
        provider: auth.viewer.provider,
      },
    });
  } catch {
    return jsonResponse({ authenticated: false }, { status: 401 });
  }
}
