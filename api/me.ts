import { jsonResponse, rateLimitRequest } from "./_lib/server.js";
import { getAuthContext } from "./_lib/session.js";

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
        userId: auth.userId,
        username: auth.viewer.minecraftUsername,
        avatarUrl: auth.viewer.avatarUrl,
        provider: auth.viewer.provider,
        role: auth.viewer.role,
        isAdmin: auth.viewer.isAdmin,
        discordId: auth.viewer.discordId ?? null,
        discordUsername: auth.viewer.discordUsername ?? null,
        discordAvatar: auth.viewer.discordAvatar ?? null,
        minecraftUuidHash: auth.viewer.minecraftUuidHash || null,
      },
    });
  } catch {
    return jsonResponse({ authenticated: false }, { status: 401 });
  }
}
