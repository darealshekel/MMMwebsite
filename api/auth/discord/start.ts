import { buildDiscordAuthorizationUrl, createDiscordOauthState } from "../../_lib/discord.js";
import {
  assertDiscordStartEnv,
  createCookie,
  hasDatabaseEnv,
  logServerError,
  OAUTH_COOKIE,
  rateLimitRequest,
  redirectResponse,
  safeInternalPath,
  signPayload,
} from "../../_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  try {
    assertDiscordStartEnv();
  } catch (error) {
    logServerError("Discord auth start configuration failed", error);
    return redirectResponse("/login?error=discord_auth_config");
  }

  try {
    if (hasDatabaseEnv()) {
      const allowed = await rateLimitRequest(request, "auth-start", "discord", 20, 10 * 60 * 1000);
      if (!allowed) {
        return new Response("Too many login attempts.", { status: 429 });
      }
    }

    const url = new URL(request.url);
    const oauth = createDiscordOauthState();
    const returnTo = safeInternalPath(url.searchParams.get("returnTo"), "/account");
    const authUrl = buildDiscordAuthorizationUrl(request, oauth.state);
    const oauthCookie = await signPayload({ provider: "discord", ...oauth, returnTo });
    return redirectResponse(authUrl, {
      "Set-Cookie": createCookie(OAUTH_COOKIE, oauthCookie, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 10,
      }),
    });
  } catch (error) {
    logServerError("Discord auth start failed", error);
    return redirectResponse("/login?error=discord_auth_start_failed");
  }
}
