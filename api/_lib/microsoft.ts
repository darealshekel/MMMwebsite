import { createRemoteJWKSet, jwtVerify } from "jose";

import { fromBase64Url, randomToken, serverEnv, toBase64Url } from "./server.js";

const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "XboxLive.signin",
];

type OAuthTokens = {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
};

type MicrosoftIdentity = {
  providerAccountId: string;
  email: string | null;
};

export type MinecraftProfile = {
  uuid: string;
  username: string;
};

export function microsoftIssuerBase() {
  return `https://login.microsoftonline.com/${serverEnv.microsoftTenantId}/v2.0`;
}

export function buildMicrosoftRedirectUri(request: Request) {
  const url = new URL(request.url);
  return `${url.origin}/api/auth/microsoft/callback`;
}

export async function buildPkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

export async function buildMicrosoftAuthorizationUrl(request: Request, state: string, nonce: string, verifier: string) {
  const authorizationUrl = new URL(`${microsoftIssuerBase()}/oauth2/v2.0/authorize`);
  authorizationUrl.searchParams.set("client_id", serverEnv.microsoftClientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", buildMicrosoftRedirectUri(request));
  authorizationUrl.searchParams.set("response_mode", "query");
  authorizationUrl.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("prompt", "select_account");
  authorizationUrl.searchParams.set("code_challenge", await buildPkceChallenge(verifier));
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  return authorizationUrl.toString();
}

export function createOauthState() {
  return {
    state: randomToken(24),
    nonce: randomToken(24),
    verifier: randomToken(48),
    issuedAt: Date.now(),
  };
}

export async function exchangeAuthorizationCode(request: Request, code: string, verifier: string): Promise<OAuthTokens> {
  const tokenResponse = await fetch(`${microsoftIssuerBase()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: serverEnv.microsoftClientId,
      client_secret: serverEnv.microsoftClientSecret,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: buildMicrosoftRedirectUri(request),
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Microsoft token exchange failed.");
  }

  return tokenResponse.json() as Promise<OAuthTokens>;
}

export async function verifyMicrosoftIdentity(idToken: string, nonce: string): Promise<MicrosoftIdentity> {
  const issuer = microsoftIssuerBase();
  const jwks = createRemoteJWKSet(new URL(`${issuer}/discovery/v2.0/keys`));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience: serverEnv.microsoftClientId,
  });

  if (!payload.sub) {
    throw new Error("Microsoft identity is missing a stable subject.");
  }

  if (payload.nonce !== nonce) {
    throw new Error("Microsoft identity nonce validation failed.");
  }

  return {
    providerAccountId: String(payload.sub),
    email: typeof payload.email === "string"
      ? payload.email
      : typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : null,
  };
}

export async function resolveMinecraftProfile(microsoftAccessToken: string): Promise<MinecraftProfile> {
  const xboxUserTokenResponse = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${microsoftAccessToken}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
  });

  if (!xboxUserTokenResponse.ok) {
    throw new Error("Xbox user token exchange failed.");
  }

  const xboxUserToken = await xboxUserTokenResponse.json() as {
    Token: string;
    DisplayClaims: { xui: Array<{ uhs: string }> };
  };
  const userHash = xboxUserToken.DisplayClaims?.xui?.[0]?.uhs;
  if (!xboxUserToken.Token || !userHash) {
    throw new Error("Xbox user token payload was incomplete.");
  }

  const xstsResponse = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      Properties: {
        SandboxId: "RETAIL",
        UserTokens: [xboxUserToken.Token],
      },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT",
    }),
  });

  if (!xstsResponse.ok) {
    throw new Error("Xbox XSTS token exchange failed.");
  }

  const xstsToken = await xstsResponse.json() as { Token: string };
  if (!xstsToken.Token) {
    throw new Error("Xbox XSTS token payload was incomplete.");
  }

  const minecraftTokenResponse = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      identityToken: `XBL3.0 x=${userHash};${xstsToken.Token}`,
    }),
  });

  if (!minecraftTokenResponse.ok) {
    throw new Error("Minecraft token exchange failed.");
  }

  const minecraftToken = await minecraftTokenResponse.json() as { access_token: string };
  if (!minecraftToken.access_token) {
    throw new Error("Minecraft token payload was incomplete.");
  }

  const profileResponse = await fetch("https://api.minecraftservices.com/minecraft/profile", {
    headers: {
      Authorization: `Bearer ${minecraftToken.access_token}`,
      Accept: "application/json",
    },
  });

  if (!profileResponse.ok) {
    throw new Error("Minecraft profile lookup failed.");
  }

  const profile = await profileResponse.json() as { id: string; name: string };
  if (!profile.id || !profile.name) {
    throw new Error("Minecraft profile data was incomplete.");
  }

  return {
    uuid: profile.id,
    username: profile.name,
  };
}
