const DEFAULT_LIVE_WEBSITE_API_URL = "https://www.mmmaniacs.com";

export function isLocalRuntime() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isLocalProductionPreview() {
  return isLocalRuntime() && !import.meta.env.DEV;
}

export function localOwnerApiUrl(path: string) {
  const base = (import.meta.env.VITE_LOCAL_OWNER_API_URL || DEFAULT_LIVE_WEBSITE_API_URL).replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function apiUrl(path: string) {
  if (!isLocalProductionPreview()) return path;

  const explicitLocalApi = import.meta.env.VITE_LOCAL_OWNER_API_URL?.trim();
  return explicitLocalApi ? localOwnerApiUrl(path) : path;
}

export function apiCredentials(): RequestCredentials {
  return isLocalProductionPreview() ? "omit" : "include";
}

export function shouldUseLocalStaticFallback() {
  if (!isLocalRuntime()) return false;

  const explicitLocalApi = import.meta.env.VITE_LOCAL_OWNER_API_URL?.trim();
  const proxyTarget = import.meta.env.VITE_API_PROXY_TARGET?.trim();
  const activeTarget = explicitLocalApi || proxyTarget || DEFAULT_LIVE_WEBSITE_API_URL;

  return !/\/\/(?:www\.)?mmmaniacs\.com(?:\/|$)/i.test(activeTarget);
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
