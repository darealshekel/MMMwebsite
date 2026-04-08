import type { SettingsSummary } from "../../src/lib/types";
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
  verifySignedPayload,
} from "./server";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type AuthViewer = {
  userId: string;
  minecraftUsername: string;
  minecraftUuidHash: string;
  provider: string;
  avatarUrl: string;
};

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

export async function issueSession(userId: string, account: Omit<AuthViewer, "userId" | "avatarUrl">) {
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
      provider: account.provider,
      avatarUrl: avatarUrl(account.minecraftUsername),
    } satisfies AuthViewer,
  };
}

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
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
      provider: account.provider,
      avatarUrl: avatarUrl(account.minecraft_username),
    },
  };
}

export async function requireCsrf(request: Request, auth: AuthContext) {
  const header = request.headers.get("x-csrf-token");
  return Boolean(header && header === auth.csrfToken);
}

export async function destroySession(request: Request) {
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
