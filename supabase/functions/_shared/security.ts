import {
  DATA_RETENTION_DAYS,
  DATA_SECURITY_POLICY,
} from "../../../src/lib/security/data-policy.ts";
import { redactForLog } from "../../../src/lib/security/redaction.ts";

const textEncoder = new TextEncoder();

type KeyRing = Record<string, string>;

export function parseKeyRing(raw: string | undefined | null): KeyRing {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as KeyRing;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function importAesKey(base64Key: string) {
  return crypto.subtle.importKey("raw", base64ToBytes(base64Key), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function encryptAtRest(value: string, keyRing: KeyRing, primaryKeyId: string) {
  const keyMaterial = keyRing[primaryKeyId];
  if (!value || !keyMaterial) {
    return value;
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(keyMaterial);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(value),
  );

  return `enc.${primaryKeyId}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

export async function decryptAtRest(value: string, keyRing: KeyRing) {
  if (!value.startsWith("enc.")) {
    return value;
  }

  const [, keyId, ivBase64, payloadBase64] = value.split(".");
  const keyMaterial = keyRing[keyId];
  if (!keyMaterial) {
    throw new Error("Unknown encryption key ID");
  }

  const key = await importAesKey(keyMaterial);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(payloadBase64),
  );

  return new TextDecoder().decode(plain);
}

export async function hashDeterministic(value: string, secret: string) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return bytesToBase64(new Uint8Array(signature)).replace(/=+$/g, "");
}

export async function hashIpForRateLimit(ipAddress: string, secret: string, dateKey: string) {
  return hashDeterministic(`${dateKey}:${ipAddress}`, secret);
}

export function extractClientIp(request: Request) {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
  ];

  return candidates.find((value) => value && value.length > 0) ?? null;
}

export function buildSecurityHeaders(origin: string | null, allowedOrigin: string | null) {
  const resolvedOrigin = origin && allowedOrigin && origin === allowedOrigin ? origin : allowedOrigin ?? "null";
  return {
    "Access-Control-Allow-Origin": resolvedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "false",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export function clientErrorResponse(
  headers: Record<string, string>,
  status = 500,
  message = "Unable to process the request.",
) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers,
  });
}

export function successResponse(headers: Record<string, string>, body: Record<string, unknown> = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers,
  });
}

export function logSecurityEvent(message: string, detail?: unknown) {
  console.error(message, redactForLog(detail ?? ""));
}

export const PRIVACY_RETENTION = DATA_RETENTION_DAYS;
export const SECURITY_FIELD_POLICY = DATA_SECURITY_POLICY;

