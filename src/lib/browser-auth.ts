import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { fetchWithTimeout, promiseWithTimeout } from "@/lib/fetch-with-timeout";

const LOGIN_PENDING_KEY = "aetweaks_login_pending";
const LOGIN_STARTED_AT_KEY = "aetweaks_login_started_at";
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export async function startMicrosoftSignIn(returnTo = "/dashboard") {
  const supabase = getSupabaseBrowserClient();
  window.sessionStorage.setItem(LOGIN_PENDING_KEY, safeReturnTo(returnTo));
  window.sessionStorage.setItem(LOGIN_STARTED_AT_KEY, String(Date.now()));
  const redirectTo = `${window.location.origin}/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
  console.info("[auth] starting Microsoft sign-in", { returnTo: safeReturnTo(returnTo) });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo,
      scopes: "openid profile email offline_access XboxLive.signin",
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export function getPendingLoginReturnTo() {
  if (typeof window === "undefined") return null;
  const startedAt = Number(window.sessionStorage.getItem(LOGIN_STARTED_AT_KEY) ?? "0");
  if (!startedAt || Date.now() - startedAt > LOGIN_WINDOW_MS) {
    clearPendingLoginState();
    return null;
  }
  return window.sessionStorage.getItem(LOGIN_PENDING_KEY);
}

export function clearPendingLoginState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LOGIN_PENDING_KEY);
  window.sessionStorage.removeItem(LOGIN_STARTED_AT_KEY);
}

export async function exchangeSupabaseCodeForSessionIfPresent(code: string | null) {
  if (!code) return null;

  const supabase = getSupabaseBrowserClient();
  console.info("[auth] exchanging Supabase OAuth code");
  const { data, error } = await promiseWithTimeout(supabase.auth.exchangeCodeForSession(code), {
    timeoutMs: 12_000,
    timeoutMessage: "Supabase took too long to finish the Microsoft callback. Please try again.",
  });
  if (error) {
    console.error("[auth] Supabase code exchange failed", error);
    throw error;
  }

  console.info("[auth] Supabase code exchange succeeded", { hasProviderToken: Boolean(data.session?.provider_token) });
  return data.session;
}

export async function getSupabaseBrowserSession() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await promiseWithTimeout(supabase.auth.getSession(), {
    timeoutMs: 8_000,
    timeoutMessage: "Supabase took too long to restore your session. Please refresh and try again.",
  });
  if (error) {
    throw error;
  }

  console.info("[auth] session fetch completed", {
    hasSession: Boolean(data.session),
    hasProviderToken: Boolean(data.session?.provider_token),
    expiresAt: data.session?.expires_at ?? null,
  });
  return data.session;
}

export async function finalizeMinecraftAccountLink(returnTo = "/dashboard") {
  const session = await getSupabaseBrowserSession();
  if (!session?.access_token) {
    throw new Error("Your Supabase session is missing. Please sign in again.");
  }

  if (!session.provider_token) {
    throw new Error("The Microsoft provider token was not returned. Make sure Microsoft is enabled in Supabase Auth and retry.");
  }

  console.info("[auth] finalizing Minecraft account link", { returnTo: safeReturnTo(returnTo) });
  const response = await fetchWithTimeout(`/api/auth/supabase/link?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    timeoutMs: 15_000,
    timeoutMessage: "AeTweaks could not finish linking your Minecraft account in time. Please try again.",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      providerToken: session.provider_token,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    console.error("[auth] Minecraft account link failed", payload);
    throw new Error(payload?.error || "Account linking failed.");
  }

  console.info("[auth] Minecraft account link succeeded");
  return response.json().catch(() => ({ ok: true })) as Promise<{ ok?: boolean; redirectTo?: string }>;
}

export async function signOutEverywhere() {
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut();
  window.location.href = "/api/auth/logout";
}
