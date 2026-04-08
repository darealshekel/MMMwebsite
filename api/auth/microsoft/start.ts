import { buildMicrosoftAuthorizationUrl, createOauthState } from "../../_lib/microsoft.js";
import {
  assertMicrosoftStartEnv,
  createCookie,
  hasDatabaseEnv,
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
  } catch {
    return redirectResponse("/login?error=auth_config");
  }
}
