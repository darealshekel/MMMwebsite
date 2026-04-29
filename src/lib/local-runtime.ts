export function isLocalRuntime() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isLocalProductionPreview() {
  return isLocalRuntime() && !import.meta.env.DEV;
}

export function localOwnerApiUrl(path: string) {
  const base = (import.meta.env.VITE_LOCAL_OWNER_API_URL || "http://127.0.0.1:4176").replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function apiUrl(path: string) {
  return isLocalProductionPreview() ? localOwnerApiUrl(path) : path;
}

export function apiCredentials(): RequestCredentials {
  return isLocalProductionPreview() ? "omit" : "include";
}

export async function readResponseBody(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function logLocalApiFailure(label: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV || isLocalRuntime()) {
    console.error(`[${label}] API request failed`, details);
  }
}
