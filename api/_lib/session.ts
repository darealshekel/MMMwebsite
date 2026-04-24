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
  discordId?: string | null;
  discordUsername?: string | null;
  discordAvatar?: string | null;
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

function discordAvatarUrl(discordId: string, avatarHash: string | null | undefined) {
  return avatarHash
    ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(discordId)}/${encodeURIComponent(avatarHash)}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordId) % 5n)}.png`;
}

function providerLabel(provider: string) {
  if (provider === "mod_code") {
    return "AeTweaks Mod";
  }
  if (provider === "microsoft") {
    return "Microsoft";
  }
  if (provider === "discord") {
    return "Discord";
  }
  if (provider === "discord_claim") {
    return "Discord Claim";
  }
  return provider;
}

function parseProfilePreferences(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function parseDiscordProfile(input: Record<string, unknown>) {
  const discord = input.discord && typeof input.discord === "object" && !Array.isArray(input.discord)
    ? (input.discord as Record<string, unknown>)
    : {};
  const id = typeof discord.id === "string" ? discord.id : null;
  const username = typeof discord.username === "string" ? discord.username : null;
  const avatar = typeof discord.avatar === "string" ? discord.avatar : null;
  return { id, username, avatar };
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

  const profilePreferences = parseProfilePreferences(data?.profile_preferences);
  const role = normalizeAppRole(profilePreferences.role);

  return {
    role,
    isAdmin: hasManagementRole(role) || profilePreferences.isAdmin === true,
  };
}

async function issueHashedSession(
  userId: string,
  hashSecret: string,
  viewerFactory: (roleInfo: { role: string; isAdmin: boolean }) => AuthViewer,
) {
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const sessionTokenHash = await hmac(sessionToken, hashSecret);
  const csrfTokenHash = await hmac(csrfToken, hashSecret);

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
    viewer: viewerFactory(roleInfo),
  };
}

export async function issueSession(userId: string, account: Omit<AuthViewer, "userId" | "avatarUrl" | "role" | "isAdmin">) {
  return issueHashedSession(userId, account.minecraftUuidHash, (roleInfo) => ({
      userId,
      minecraftUsername: account.minecraftUsername,
      minecraftUuidHash: account.minecraftUuidHash,
      provider: providerLabel(account.provider),
      avatarUrl: avatarUrl(account.minecraftUsername),
      role: roleInfo.role,
      isAdmin: roleInfo.isAdmin,
    } satisfies AuthViewer));
}

export async function issueDiscordSession(userId: string, discord: { id: string; username: string; avatar?: string | null }) {
  return issueHashedSession(userId, `discord:${userId}`, (roleInfo) => ({
    userId,
    minecraftUsername: discord.username,
    minecraftUuidHash: "",
    provider: providerLabel("discord"),
    avatarUrl: discordAvatarUrl(discord.id, discord.avatar),
    role: roleInfo.role,
    isAdmin: roleInfo.isAdmin,
    discordId: discord.id,
    discordUsername: discord.username,
    discordAvatar: discord.avatar ?? null,
  } satisfies AuthViewer));
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

  const [accountLookup, userLookup, sessionLookup] = await Promise.all([
    supabaseAdmin
      .from("connected_accounts")
      .select("user_id,provider,minecraft_username,minecraft_uuid_hash")
      .eq("user_id", payload.u)
      .order("updated_at", { ascending: false })
      .limit(1),
    supabaseAdmin
      .from("users")
      .select("id,profile_preferences")
      .eq("id", payload.u)
      .maybeSingle(),
    supabaseAdmin
      .from("auth_sessions")
      .select("id,user_id,session_token_hash,csrf_token_hash,expires_at")
      .eq("user_id", payload.u)
      .gt("expires_at", new Date().toISOString()),
  ]);

  if (accountLookup.error) throw accountLookup.error;
  if (userLookup.error) throw userLookup.error;
  if (sessionLookup.error) throw sessionLookup.error;
  if (!userLookup.data) return null;

  const account = (accountLookup.data ?? [])[0] as
    | {
        user_id: string;
        provider: string;
        minecraft_username: string;
        minecraft_uuid_hash: string;
      }
    | undefined;

  const hashKeys = [`discord:${payload.u}`];
  if (account?.minecraft_uuid_hash) {
    hashKeys.push(account.minecraft_uuid_hash);
  }
  const candidatePairs = await Promise.all(hashKeys.map(async (key) => ({
    sessionTokenHash: await hmac(payload.t, key),
    csrfTokenHash: await hmac(payload.c, key),
  })));

  const matchingSession = (sessionLookup.data ?? []).find((session) =>
    candidatePairs.some((candidate) =>
      session.session_token_hash === candidate.sessionTokenHash &&
      session.csrf_token_hash === candidate.csrfTokenHash,
    ),
  ) ?? null;
  if (!matchingSession) {
    return null;
  }

  const roleInfo = await resolveUserRole(payload.u);
  const profilePreferences = parseProfilePreferences(userLookup.data.profile_preferences);
  const discord = parseDiscordProfile(profilePreferences);
  const displayName = account?.minecraft_username ?? discord.username ?? "Discord User";
  const displayAvatarUrl = account?.minecraft_username
    ? avatarUrl(account.minecraft_username)
    : discord.id
      ? discordAvatarUrl(discord.id, discord.avatar)
      : avatarUrl(displayName);

  void supabaseAdmin
    .from("auth_sessions")
    .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", matchingSession.id);

  return {
    sessionId: matchingSession.id,
    userId: payload.u,
    sessionToken: payload.t,
    csrfToken: payload.c,
    viewer: {
      userId: payload.u,
      minecraftUsername: displayName,
      minecraftUuidHash: account?.minecraft_uuid_hash ?? "",
      provider: providerLabel(account?.provider ?? "discord"),
      avatarUrl: displayAvatarUrl,
      role: roleInfo.role,
      isAdmin: roleInfo.isAdmin,
      discordId: discord.id,
      discordUsername: discord.username,
      discordAvatar: discord.avatar,
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
