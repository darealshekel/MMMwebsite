import type { SettingsSummary } from "../../src/lib/types.js";
import {
  appendCookies,
  clearCookie,
  createCookie,
  CSRF_COOKIE,
  hmac,
  OAUTH_COOKIE,
  parseCookies,
  randomToken,
  SESSION_COOKIE,
  signPayload,
  supabaseAdmin,
  getHeader,
  verifySignedPayload,
} from "./server.js";
import { isManagementRole, normalizeAppRole } from "../../shared/admin-management.js";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type AuthViewer = {
  userId: string;
  minecraftUsername: string;
  minecraftUuidHash: string;
  provider: string;
  avatarUrl: string;
  role: string;
  isAdmin: boolean;
};

export function hasManagementRole(role: string | null | undefined) {
  return isManagementRole(role);
}

export type AuthContext = {
  sessionId: string;
  userId: string;
  sessionToken: string;
  csrfToken: string;
  viewer: AuthViewer;
};

type SessionCookiePayload = {
  u: string;
  t: string;
  c: string;
  e: number;
};

export const DEFAULT_SETTINGS: SettingsSummary = {
  autoSyncMiningData: true,
  crossServerAggregation: true,
  realTimeHudSync: false,
  leaderboardOptIn: true,
  publicProfile: true,
  sessionSharing: false,
  hudEnabled: true,
  hudAlignment: "top-right",
  hudScale: 1,
};

function avatarUrl(username: string) {
  return `https://minotar.net/avatar/${encodeURIComponent(username)}/48`;
}

function providerLabel(provider: string) {
  if (provider === "mod_code") {
    return "AeTweaks Mod";
  }
  if (provider === "microsoft") {
    return "Microsoft";
  }
  return provider;
}

async function resolveUserRole(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("profile_preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const profilePreferences =
    data?.profile_preferences && typeof data.profile_preferences === "object" && !Array.isArray(data.profile_preferences)
      ? (data.profile_preferences as Record<string, unknown>)
      : {};
  const role = normalizeAppRole(profilePreferences.role);

  return {
    role,
    isAdmin: hasManagementRole(role) || profilePreferences.isAdmin === true,
  };
}

export async function issueSession(userId: string, account: Omit<AuthViewer, "userId" | "avatarUrl" | "role" | "isAdmin">) {
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const sessionTokenHash = await hmac(sessionToken, account.minecraftUuidHash);
  const csrfTokenHash = await hmac(csrfToken, account.minecraftUuidHash);

  const { data, error } = await supabaseAdmin
    .from("auth_sessions")
    .insert({
      user_id: userId,
      session_token_hash: sessionTokenHash,
      csrf_token_hash: csrfTokenHash,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const signedSession = await signPayload({
    u: userId,
    t: sessionToken,
    c: csrfToken,
    e: expiresAt.getTime(),
  } satisfies SessionCookiePayload);

  const roleInfo = await resolveUserRole(userId);

  return {
    sessionId: data.id as string,
    cookies: [
      createCookie(SESSION_COOKIE, signedSession, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
        expires: expiresAt,
      }),
      createCookie(CSRF_COOKIE, csrfToken, {
        httpOnly: false,
        sameSite: "strict",
        maxAge: SESSION_MAX_AGE_SECONDS,
        expires: expiresAt,
      }),
    ],
    viewer: {
      userId,
      minecraftUsername: account.minecraftUsername,
      minecraftUuidHash: account.minecraftUuidHash,
      provider: providerLabel(account.provider),
      avatarUrl: avatarUrl(account.minecraftUsername),
      role: roleInfo.role,
      isAdmin: roleInfo.isAdmin,
    } satisfies AuthViewer,
  };
}

type RequestLike = {
  headers?: Headers | Record<string, string | string[] | undefined>;
};

export async function getAuthContext(request: RequestLike): Promise<AuthContext | null> {
  const cookies = parseCookies(request);
  const signedSession = cookies[SESSION_COOKIE];
  const csrfCookie = cookies[CSRF_COOKIE];

  if (!signedSession || !csrfCookie) {
    return null;
  }

  const payload = await verifySignedPayload<SessionCookiePayload>(signedSession);
  if (!payload || payload.e <= Date.now()) {
    return null;
  }

  if (payload.c !== csrfCookie) {
    return null;
  }

  const { data: accountRows, error: sessionError } = await supabaseAdmin
    .from("connected_accounts")
    .select("user_id,provider,minecraft_username,minecraft_uuid_hash")
    .eq("user_id", payload.u)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (sessionError || !accountRows?.[0]) {
    return null;
  }

  const account = accountRows[0] as {
    user_id: string;
    provider: string;
    minecraft_username: string;
    minecraft_uuid_hash: string;
  };

  const sessionTokenHash = await hmac(payload.t, account.minecraft_uuid_hash);
  const csrfTokenHash = await hmac(payload.c, account.minecraft_uuid_hash);
  const sessionLookup = await supabaseAdmin
    .from("auth_sessions")
    .select("id,user_id,session_token_hash,csrf_token_hash,expires_at")
    .eq("user_id", payload.u)
    .eq("session_token_hash", sessionTokenHash)
    .eq("csrf_token_hash", csrfTokenHash)
    .gt("expires_at", new Date().toISOString());

  if (sessionLookup.error) {
    throw sessionLookup.error;
  }

  const matchingSession = (sessionLookup.data ?? [])[0] ?? null;
  if (!matchingSession) {
    return null;
  }

  const roleInfo = await resolveUserRole(account.user_id);

  void supabaseAdmin
    .from("auth_sessions")
    .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", matchingSession.id);

  return {
    sessionId: matchingSession.id,
    userId: account.user_id,
    sessionToken: payload.t,
    csrfToken: payload.c,
    viewer: {
      userId: account.user_id,
      minecraftUsername: account.minecraft_username,
      minecraftUuidHash: account.minecraft_uuid_hash,
      provider: providerLabel(account.provider),
      avatarUrl: avatarUrl(account.minecraft_username),
      role: roleInfo.role,
      isAdmin: roleInfo.isAdmin,
    },
  };
}

export async function requireCsrf(request: RequestLike, auth: AuthContext) {
  const header = getHeader(request.headers, "x-csrf-token");
  return Boolean(header && header === auth.csrfToken);
}

export async function destroySession(request: RequestLike) {
  const auth = await getAuthContext(request);
  if (auth) {
    await supabaseAdmin.from("auth_sessions").delete().eq("id", auth.sessionId);
  }

  return [
    clearCookie(SESSION_COOKIE, true),
    clearCookie(CSRF_COOKIE, false),
    clearCookie(OAUTH_COOKIE, true),
  ];
}

export function applySessionCookies(headers: Headers, cookies: string[]) {
  appendCookies(headers, cookies);
}
