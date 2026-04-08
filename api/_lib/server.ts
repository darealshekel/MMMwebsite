import { createClient } from "@supabase/supabase-js";
import { parse, serialize } from "cookie";

import { redactForLog } from "../../src/lib/security/redaction";

export const SESSION_COOKIE = "aetweaks_session";
export const CSRF_COOKIE = "aetweaks_csrf";
export const OAUTH_COOKIE = "aetweaks_oauth";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const serverEnv = {
  supabaseUrl: process.env.VITE_SUPABASE_URL?.trim() ?? "",
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
  appBaseUrl: process.env.APP_BASE_URL?.trim() ?? "",
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID?.trim() ?? "",
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "",
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID?.trim() || "consumers",
  sessionSecret: process.env.SESSION_SIGNING_SECRET?.trim() ?? "",
  hashSecret: process.env.AE_HASH_SECRET?.trim() ?? "",
  ipHashSecret: process.env.AE_IP_HASH_SECRET?.trim() ?? "",
  encryptionKeysJson: process.env.AE_ENCRYPTION_KEYS_JSON?.trim() ?? "",
  primaryEncryptionKeyId: process.env.AE_PRIMARY_ENCRYPTION_KEY_ID?.trim() ?? "",
};

type KeyRing = Record<string, string>;

export const supabaseAdmin = createClient(
  serverEnv.supabaseUrl || "https://example.supabase.co",
  serverEnv.supabaseServiceRoleKey || "test-service-role-key",
  {
  auth: { persistSession: false, autoRefreshToken: false },
  },
);

export function assertServerEnv() {
  const required = [
    "VITE_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "SESSION_SIGNING_SECRET",
    "AE_HASH_SECRET",
    "AE_IP_HASH_SECRET",
    "AE_ENCRYPTION_KEYS_JSON",
    "AE_PRIMARY_ENCRYPTION_KEY_ID",
  ];

  const missing = required.filter((key) => {
    switch (key) {
      case "VITE_SUPABASE_URL":
        return !serverEnv.supabaseUrl;
      case "SUPABASE_SERVICE_ROLE_KEY":
        return !serverEnv.supabaseServiceRoleKey;
      case "MICROSOFT_CLIENT_ID":
        return !serverEnv.microsoftClientId;
      case "MICROSOFT_CLIENT_SECRET":
        return !serverEnv.microsoftClientSecret;
      case "SESSION_SIGNING_SECRET":
        return !serverEnv.sessionSecret;
      case "AE_HASH_SECRET":
        return !serverEnv.hashSecret;
      case "AE_IP_HASH_SECRET":
        return !serverEnv.ipHashSecret;
      case "AE_ENCRYPTION_KEYS_JSON":
        return !serverEnv.encryptionKeysJson;
      case "AE_PRIMARY_ENCRYPTION_KEY_ID":
        return !serverEnv.primaryEncryptionKeyId;
      default:
        return false;
    }
  });

  if (missing.length > 0) {
    throw new Error(`Missing required server environment variables: ${missing.join(", ")}`);
  }
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export function redirectResponse(location: string, headers?: HeadersInit, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      ...(headers ?? {}),
    },
  });
}

export function parseCookies(request: Request) {
  return parse(request.headers.get("cookie") ?? "");
}

export function appendCookies(headers: Headers, cookies: string[]) {
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));
}

export function createCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
    maxAge?: number;
    expires?: Date;
  } = {},
) {
  return serialize(name, value, {
    path: "/",
    secure: true,
    httpOnly: options.httpOnly ?? true,
    sameSite: options.sameSite ?? "lax",
    maxAge: options.maxAge,
    expires: options.expires,
  });
}

export function clearCookie(name: string, httpOnly = true) {
  return createCookie(name, "", {
    httpOnly,
    expires: new Date(0),
    maxAge: 0,
  });
}

export function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

export async function hashDeterministicValue(value: string) {
  return hmac(value, serverEnv.hashSecret);
}

export function parseKeyRing(): KeyRing {
  try {
    return JSON.parse(serverEnv.encryptionKeysJson) as KeyRing;
  } catch {
    return {};
  }
}

async function importAesKey(base64Key: string) {
  return crypto.subtle.importKey("raw", fromBase64Url(base64Key), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptAtRest(value: string) {
  const keyRing = parseKeyRing();
  const keyId = serverEnv.primaryEncryptionKeyId;
  const keyValue = keyRing[keyId];

  if (!value || !keyValue) {
    throw new Error("Encryption key configuration is missing.");
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(keyValue);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(value),
  );

  return `enc.${keyId}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64Url(value);
}

export async function hashIpForBucket(ip: string) {
  const day = new Date().toISOString().slice(0, 10);
  return hmac(`${day}:${ip}`, serverEnv.ipHashSecret);
}

export async function signPayload(payload: Record<string, unknown>) {
  const raw = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signature = await hmac(raw, serverEnv.sessionSecret);
  return `${raw}.${signature}`;
}

export async function verifySignedPayload<T>(value: string): Promise<T | null> {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = await hmac(payload, serverEnv.sessionSecret);
  if (signature !== expected) {
    return null;
  }

  try {
    return JSON.parse(textDecoder.decode(fromBase64Url(payload))) as T;
  } catch {
    return null;
  }
}

export function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Uint8Array.from(atob(normalized + padding), (char) => char.charCodeAt(0));
}

export function buildAppUrl(path: string) {
  if (serverEnv.appBaseUrl) {
    return new URL(path, serverEnv.appBaseUrl).toString();
  }

  return path;
}

export function safeInternalPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }

  if (value.startsWith("//") || value.includes("\r") || value.includes("\n")) {
    return fallback;
  }

  return value;
}

export async function rateLimitRequest(request: Request, namespace: string, identifier: string, maxRequests: number, windowMs: number) {
  const ipHash = await hashIpForBucket(getClientIp(request));
  const bucketWindow = Math.floor(Date.now() / windowMs);
  const bucketKey = await hmac(`${namespace}:${identifier}:${ipHash}:${bucketWindow}`, serverEnv.hashSecret);

  const { data, error } = await supabaseAdmin
    .from("sync_request_limits")
    .select("request_count")
    .eq("bucket_key", bucketKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const currentCount = Number(data?.request_count ?? 0);
  if (currentCount >= maxRequests) {
    return false;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const { error: upsertError } = await supabaseAdmin
    .from("sync_request_limits")
    .upsert({
      bucket_key: bucketKey,
      request_count: currentCount + 1,
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: "bucket_key" });

  if (upsertError) {
    throw upsertError;
  }

  return true;
}

export function logServerError(message: string, error: unknown) {
  console.error(message, redactForLog(error instanceof Error ? error.message : error));
}
