import { appEnv } from "@/lib/env";

export function buildApiHeaders() {
  return {
    apikey: appEnv.supabaseAnonKey,
    Authorization: `Bearer ${appEnv.supabaseAnonKey}`,
    "Content-Type": "application/json",
  };
}

export function buildApiUrl(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${appEnv.supabaseUrl}/rest/v1/${path}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

export async function selectRows<T>(path: string, params?: Record<string, string | number | undefined>) {
  const response = await fetch(buildApiUrl(path, params), {
    headers: buildApiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`${path} query failed (${response.status})`);
  }

  return (await response.json()) as T[];
}
