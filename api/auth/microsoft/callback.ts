import { exchangeAuthorizationCode, MinecraftLinkError, resolveMinecraftProfile, verifyMicrosoftIdentity } from "../../_lib/microsoft.js";
import {
  assertMicrosoftCallbackEnv,
  appendCookies,
  clearCookie,
  encryptAtRest,
  hashDeterministicValue,
  jsonResponse,
  logServerError,
  OAUTH_COOKIE,
  parseCookies,
  rateLimitRequest,
  redirectResponse,
  supabaseAdmin,
  verifySignedPayload,
} from "../../_lib/server.js";
import { issueSession } from "../../_lib/session.js";

export const config = { runtime: "edge" };

type OauthCookiePayload = {
  state: string;
  nonce: string;
  verifier: string;
  issuedAt: number;
  returnTo: string;
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const authError = url.searchParams.get("error");

  if (authError) {
    return redirectResponse(`/login?error=${encodeURIComponent(authError)}`);
  }

  if (!code || !state) {
    return redirectResponse("/login?error=missing_code");
  }

  try {
    assertMicrosoftCallbackEnv();
    const allowed = await rateLimitRequest(request, "auth-callback", "microsoft", 30, 10 * 60 * 1000);
    if (!allowed) {
      return jsonResponse({ error: "Too many login attempts." }, { status: 429 });
    }

    const cookies = parseCookies(request);
    const oauthCookie = cookies[OAUTH_COOKIE];
    if (!oauthCookie) {
      return redirectResponse("/login?error=missing_oauth_state");
    }

    const oauth = await verifySignedPayload<OauthCookiePayload>(oauthCookie);
    if (!oauth || oauth.state !== state || Date.now() - oauth.issuedAt > 10 * 60 * 1000) {
      return redirectResponse("/login?error=invalid_oauth_state");
    }

    const tokens = await exchangeAuthorizationCode(request, code, oauth.verifier);
    const minecraftProfile = await resolveMinecraftProfile(tokens.access_token);
    const minecraftUuidHash = await hashDeterministicValue(minecraftProfile.uuid.toLowerCase());
    const encryptedMinecraftUuid = await encryptAtRest(minecraftProfile.uuid.toLowerCase());
    let providerAccountId = `minecraft:${minecraftUuidHash}`;

    if (tokens.id_token) {
      try {
        const microsoftIdentity = await verifyMicrosoftIdentity(tokens.id_token, oauth.nonce);
        providerAccountId = `microsoft:${microsoftIdentity.providerAccountId}`;
      } catch (identityError) {
        logServerError("Microsoft identity verification failed, falling back to Minecraft UUID linkage", identityError);
      }
    }

    const [providerLookup, uuidLookup] = await Promise.all([
      supabaseAdmin
        .from("connected_accounts")
        .select("id,user_id")
        .eq("provider_account_id", providerAccountId)
        .maybeSingle(),
      supabaseAdmin
        .from("connected_accounts")
        .select("id,user_id")
        .eq("minecraft_uuid_hash", minecraftUuidHash)
        .maybeSingle(),
    ]);

    if (providerLookup.error) throw providerLookup.error;
    if (uuidLookup.error) throw uuidLookup.error;

    let userId = providerLookup.data?.user_id ?? uuidLookup.data?.user_id ?? null;
    if (!userId) {
      const insertedUser = await supabaseAdmin.from("users").insert({}).select("id").single();
      if (insertedUser.error) throw insertedUser.error;
      userId = insertedUser.data.id as string;
    }

    const existingAccountId = providerLookup.data?.id ?? uuidLookup.data?.id ?? null;
    if (existingAccountId) {
      const updated = await supabaseAdmin
        .from("connected_accounts")
        .update({
          user_id: userId,
          provider: "microsoft",
          provider_account_id: providerAccountId,
          minecraft_uuid: encryptedMinecraftUuid,
          minecraft_uuid_hash: minecraftUuidHash,
          minecraft_username: minecraftProfile.username,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingAccountId);
      if (updated.error) throw updated.error;
    } else {
      const inserted = await supabaseAdmin.from("connected_accounts").insert({
        user_id: userId,
        provider: "microsoft",
        provider_account_id: providerAccountId,
        minecraft_uuid: encryptedMinecraftUuid,
        minecraft_uuid_hash: minecraftUuidHash,
        minecraft_username: minecraftProfile.username,
      });
      if (inserted.error) throw inserted.error;
    }

    const session = await issueSession(userId, {
      minecraftUsername: minecraftProfile.username,
      minecraftUuidHash,
      provider: "microsoft",
    });

    const headers = new Headers({ Location: oauth.returnTo || "/dashboard", "Cache-Control": "no-store" });
    appendCookies(headers, [...session.cookies, clearCookie(OAUTH_COOKIE, true)]);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    logServerError("Microsoft auth callback failed", error);
    if (error instanceof MinecraftLinkError) {
      const message = new URLSearchParams({
        error: "link_failed",
        message: error.message,
      });
      return redirectResponse(`/login?${message.toString()}`);
    }
    return redirectResponse("/login?error=link_failed");
  }
}
