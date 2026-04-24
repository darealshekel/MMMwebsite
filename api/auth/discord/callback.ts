import { exchangeDiscordAuthorizationCode, fetchDiscordProfile, findOrCreateDiscordUser } from "../../_lib/discord.js";
import {
  appendCookies,
  assertDiscordCallbackEnv,
  clearCookie,
  jsonResponse,
  logServerError,
  OAUTH_COOKIE,
  parseCookies,
  rateLimitRequest,
  redirectResponse,
  verifySignedPayload,
} from "../../_lib/server.js";
import { issueDiscordSession } from "../../_lib/session.js";

export const config = { runtime: "edge" };

type DiscordOauthCookiePayload = {
  provider?: string;
  state: string;
  issuedAt: number;
  returnTo: string;
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const authError = url.searchParams.get("error");
  let stage = "received";

  if (authError) {
    logServerError("Discord auth provider returned an error", new Error(authError), { stage: "provider_redirect" });
    return redirectResponse(`/login?error=${encodeURIComponent(authError)}`);
  }

  if (!code || !state) {
    logServerError("Discord auth callback missing code or state", new Error("Missing Discord OAuth callback parameters"), {
      stage: "validate_query",
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    return redirectResponse("/login?error=missing_discord_code");
  }

  try {
    stage = "assert_env";
    assertDiscordCallbackEnv();
    stage = "rate_limit";
    const allowed = await rateLimitRequest(request, "auth-callback", "discord", 30, 10 * 60 * 1000);
    if (!allowed) {
      return jsonResponse({ error: "Too many login attempts." }, { status: 429 });
    }

    stage = "verify_oauth_cookie";
    const oauthCookie = parseCookies(request)[OAUTH_COOKIE];
    if (!oauthCookie) {
      return redirectResponse("/login?error=missing_oauth_state");
    }

    const oauth = await verifySignedPayload<DiscordOauthCookiePayload>(oauthCookie);
    if (!oauth || oauth.provider !== "discord" || oauth.state !== state || Date.now() - oauth.issuedAt > 10 * 60 * 1000) {
      return redirectResponse("/login?error=invalid_oauth_state");
    }

    stage = "exchange_code";
    const accessToken = await exchangeDiscordAuthorizationCode(request, code);
    stage = "fetch_profile";
    const discordProfile = await fetchDiscordProfile(accessToken);
    stage = "find_or_create_user";
    const userId = await findOrCreateDiscordUser(discordProfile);
    stage = "issue_session";
    const session = await issueDiscordSession(userId, {
      id: discordProfile.id,
      username: discordProfile.username,
      avatar: discordProfile.avatar,
    });

    const headers = new Headers({ Location: oauth.returnTo || "/account", "Cache-Control": "no-store" });
    appendCookies(headers, [...session.cookies, clearCookie(OAUTH_COOKIE, true)]);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    logServerError("Discord auth callback failed", error, { stage });
    return redirectResponse("/login?error=discord_link_failed");
  }
}
