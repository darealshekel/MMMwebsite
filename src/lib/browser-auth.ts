import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export async function startMicrosoftSignIn(returnTo = "/dashboard") {
  const supabase = getSupabaseBrowserClient();
  const redirectTo = `${window.location.origin}/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;

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

export async function exchangeSupabaseCodeForSessionIfPresent(code: string | null) {
  if (!code) return null;

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    throw error;
  }

  return data.session;
}

export async function getSupabaseBrowserSession() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

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

  const response = await fetch(`/api/auth/supabase/link?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`, {
    method: "POST",
    credentials: "include",
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
    throw new Error(payload?.error || "Account linking failed.");
  }

  return response.json().catch(() => ({ ok: true })) as Promise<{ ok?: boolean; redirectTo?: string }>;
}

export async function signOutEverywhere() {
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut();
  window.location.href = "/api/auth/logout";
}
