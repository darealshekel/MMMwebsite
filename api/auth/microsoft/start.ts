import { buildMicrosoftAuthorizationUrl, createOauthState } from "../../_lib/microsoft.js";
import {
  assertMicrosoftStartEnv,
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
    assertMicrosoftStartEnv();
  } catch (error) {
    logServerError("Microsoft auth start configuration failed", error);
    return redirectResponse("/login?error=auth_config");
  }

  try {
    if (hasDatabaseEnv()) {
      const allowed = await rateLimitRequest(request, "auth-start", "microsoft", 20, 10 * 60 * 1000);
      if (!allowed) {
        return new Response("Too many login attempts.", { status: 429 });
      }
    }

    const url = new URL(request.url);
    const oauth = createOauthState();
    const returnTo = safeInternalPath(url.searchParams.get("returnTo"), "/dashboard");
    const authUrl = await buildMicrosoftAuthorizationUrl(request, oauth.state, oauth.nonce, oauth.verifier);
    const oauthCookie = await signPayload({ ...oauth, returnTo });
    return redirectResponse(authUrl, {
      "Set-Cookie": createCookie(OAUTH_COOKIE, oauthCookie, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 10,
      }),
    });
  } catch (error) {
    logServerError("Microsoft auth start failed", error);
    const message = error instanceof Error ? error.message : "Microsoft sign-in could not be started.";
    return redirectResponse(`/login?error=auth_start_failed&message=${encodeURIComponent(message)}`);
  }
}
