import {
  randomToken,
  serverEnv,
  supabaseAdmin,
} from "./server.js";

export type DiscordOauthState = {
  state: string;
  issuedAt: number;
};

export type DiscordProfile = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

export class DiscordAuthError extends Error {
  constructor(message: string, public readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DiscordAuthError";
  }
}

export function createDiscordOauthState(): DiscordOauthState {
  return {
    state: randomToken(24),
    issuedAt: Date.now(),
  };
}

export function discordRedirectUri(request: Request) {
  if (serverEnv.discordRedirectUri) {
    return serverEnv.discordRedirectUri;
  }

  return new URL("/api/auth/discord/callback", request.url).toString();
}

export function buildDiscordAuthorizationUrl(request: Request, state: string) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", serverEnv.discordClientId);
  url.searchParams.set("redirect_uri", discordRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeDiscordAuthorizationCode(request: Request, code: string) {
  const body = new URLSearchParams({
    client_id: serverEnv.discordClientId,
    client_secret: serverEnv.discordClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: discordRedirectUri(request),
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await response.json().catch(() => null) as { access_token?: string; token_type?: string; error?: string; error_description?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new DiscordAuthError("Discord token exchange failed.", {
      status: response.status,
      discordError: payload?.error,
      discordErrorDescription: payload?.error_description,
    });
  }

  return payload.access_token;
}

export async function fetchDiscordProfile(accessToken: string): Promise<DiscordProfile> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  const payload = await response.json().catch(() => null) as
    | { id?: string; username?: string; global_name?: string | null; avatar?: string | null }
    | null;

  if (!response.ok || !payload?.id || !payload.username) {
    throw new DiscordAuthError("Discord profile lookup failed.", { status: response.status });
  }

  return {
    id: payload.id,
    username: payload.global_name || payload.username,
    globalName: payload.global_name ?? null,
    avatar: payload.avatar ?? null,
  };
}

function parsePreferences(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? { ...(input as Record<string, unknown>) }
    : {};
}

function hasDiscordId(preferences: Record<string, unknown>, discordId: string) {
  const discord = preferences.discord && typeof preferences.discord === "object" && !Array.isArray(preferences.discord)
    ? preferences.discord as Record<string, unknown>
    : null;
  return discord?.id === discordId;
}

export async function findOrCreateDiscordUser(profile: DiscordProfile) {
  const directLookup = await supabaseAdmin
    .from("users")
    .select("id,profile_preferences")
    .eq("profile_preferences->discord->>id", profile.id)
    .maybeSingle();

  let existing = directLookup.error ? undefined : directLookup.data as { id: string; profile_preferences?: unknown } | null | undefined;

  const usersLookup = existing ? null : await supabaseAdmin
    .from("users")
    .select("id,profile_preferences")
    .limit(5000);
  if (usersLookup?.error) {
    throw new DiscordAuthError("Discord user lookup failed.", {
      supabaseCode: usersLookup.error.code,
      supabaseMessage: usersLookup.error.message,
    });
  }

  existing = existing ?? (usersLookup?.data ?? []).find((row) =>
    hasDiscordId(parsePreferences(row.profile_preferences), profile.id),
  ) as { id: string; profile_preferences?: unknown } | undefined;

  const now = new Date().toISOString();
  const nextDiscord = {
    id: profile.id,
    username: profile.username,
    avatar: profile.avatar,
    globalName: profile.globalName,
    linkedAt: now,
  };

  if (existing) {
    const preferences = parsePreferences(existing.profile_preferences);
    const nextPreferences = {
      ...preferences,
      role: preferences.role ?? "user",
      discord: nextDiscord,
    };
    const updated = await supabaseAdmin
      .from("users")
      .update({ profile_preferences: nextPreferences, updated_at: now })
      .eq("id", existing.id);
    if (updated.error) {
      throw new DiscordAuthError("Discord user update failed.", {
        supabaseCode: updated.error.code,
        supabaseMessage: updated.error.message,
      });
    }
    return existing.id;
  }

  const inserted = await supabaseAdmin
    .from("users")
    .insert({
      profile_preferences: {
        role: "user",
        discord: nextDiscord,
      },
    })
    .select("id")
    .single();
  if (inserted.error) {
    throw new DiscordAuthError("Discord user insert failed.", {
      supabaseCode: inserted.error.code,
      supabaseMessage: inserted.error.message,
    });
  }
  return inserted.data.id as string;
}
