import { MinecraftLinkError, resolveMinecraftProfile } from "../../_lib/microsoft.js";
import {
  appendCookies,
  encryptAtRest,
  hashDeterministicValue,
  jsonResponse,
  logServerError,
  rateLimitRequest,
  safeInternalPath,
  serverEnv,
  supabaseAdmin,
} from "../../_lib/server.js";
import { issueSession } from "../../_lib/session.js";

export const config = { runtime: "edge" };

type LinkBody = {
  providerToken?: string;
};

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return header.slice(7).trim();
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const accessToken = readBearerToken(request);
    if (!accessToken) {
      return jsonResponse({ error: "Missing Supabase access token." }, { status: 401 });
    }

    if (!serverEnv.supabaseUrl || !serverEnv.supabaseServiceRoleKey) {
      return jsonResponse({ error: "Supabase auth is not configured on the backend." }, { status: 500 });
    }

    const allowed = await rateLimitRequest(request, "supabase-auth-link", "microsoft", 20, 10 * 60 * 1000);
    if (!allowed) {
      return jsonResponse({ error: "Too many login attempts." }, { status: 429 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return jsonResponse({ error: "Your Supabase session is invalid or expired." }, { status: 401 });
    }

    const user = userData.user;
    if ((user.app_metadata?.provider ?? "") !== "azure") {
      return jsonResponse({ error: "This account was not signed in with Microsoft." }, { status: 400 });
    }

    const body = await request.json().catch(() => null) as LinkBody | null;
    const providerToken = body?.providerToken?.trim() ?? "";
    if (!providerToken) {
      return jsonResponse({
        error: "Microsoft provider access was not returned by Supabase. Enable the Microsoft provider in Supabase Auth and retry.",
      }, { status: 400 });
    }

    const minecraftProfile = await resolveMinecraftProfile(providerToken);
    const minecraftUuidHash = await hashDeterministicValue(minecraftProfile.uuid.toLowerCase());
    const encryptedMinecraftUuid = await encryptAtRest(minecraftProfile.uuid.toLowerCase());
    const providerAccountId = `supabase:${user.id}`;

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

    const returnTo = safeInternalPath(new URL(request.url).searchParams.get("returnTo"), "/dashboard");
    const headers = new Headers();
    appendCookies(headers, session.cookies);
    return jsonResponse({
      ok: true,
      redirectTo: returnTo,
      viewer: session.viewer,
    }, { headers });
  } catch (error) {
    logServerError("Supabase Microsoft account link failed", error);
    if (error instanceof MinecraftLinkError) {
      return jsonResponse({ error: error.message, details: error.details }, { status: error.status });
    }
    return jsonResponse({ error: "Microsoft sign-in completed, but MMM could not link your Minecraft account." }, { status: 500 });
  }
}
