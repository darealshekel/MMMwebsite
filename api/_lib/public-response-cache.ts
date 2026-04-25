import { supabaseAdmin } from "./server.js";

type CachedPublicResponse = {
  version: 1;
  generatedAt: string;
  payload: unknown;
};

const RESPONSE_MAX_AGE_MS = 24 * 60 * 60_000;
const RESPONSE_KEY_PREFIX = "public-response:";

function toInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function normalizedMinBlocks(url: URL) {
  return Math.max(0, Number(url.searchParams.get("minBlocks") ?? "0")) || 0;
}

function hasQuery(url: URL) {
  return Boolean(String(url.searchParams.get("query") ?? "").trim());
}

export function mainLeaderboardResponseCacheKey(url: URL) {
  if (url.searchParams.get("source") || hasQuery(url) || normalizedMinBlocks(url) > 0) {
    return null;
  }

  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, toInt(url.searchParams.get("pageSize"), 30)));
  if (page === 1 && (pageSize === 20 || pageSize === 1)) {
    return `${RESPONSE_KEY_PREFIX}leaderboard:main:p${page}:s${pageSize}`;
  }
  return null;
}

export function specialLeaderboardResponseCacheKey(url: URL) {
  const kind = url.searchParams.get("kind") ?? "";
  if (kind !== "ssp-hsp" || hasQuery(url) || normalizedMinBlocks(url) > 0) {
    return null;
  }

  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, toInt(url.searchParams.get("pageSize"), 30)));
  return page === 1 && pageSize === 20 ? `${RESPONSE_KEY_PREFIX}leaderboard:special:ssp-hsp:p1:s20` : null;
}

function cacheAgeMs(value: unknown, now: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Number.POSITIVE_INFINITY;
  }
  const generatedAt = (value as { generatedAt?: unknown }).generatedAt;
  const timestamp = typeof generatedAt === "string" ? new Date(generatedAt).getTime() : 0;
  return timestamp > 0 ? now - timestamp : Number.POSITIVE_INFINITY;
}

function unwrapCachedResponse(value: unknown, now: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const cached = value as Partial<CachedPublicResponse>;
  if (cached.version !== 1 || cacheAgeMs(cached, now) > RESPONSE_MAX_AGE_MS) {
    return null;
  }
  return cached.payload ?? null;
}

export async function readCachedPublicResponse(cacheKey: string | null) {
  if (!cacheKey) return null;
  const now = Date.now();

  const audit = await supabaseAdmin
    .from("admin_audit_log")
    .select("after_state")
    .eq("action_type", "public-cache.response")
    .eq("target_type", "public-cache")
    .eq("target_id", cacheKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const auditPayload = audit.error ? null : (audit.data as { after_state?: unknown } | null)?.after_state;
  const cachedAuditResponse = unwrapCachedResponse(auditPayload, now);
  if (cachedAuditResponse) {
    return cachedAuditResponse;
  }

  const primary = await supabaseAdmin
    .from("mmm_public_snapshots")
    .select("payload")
    .eq("id", cacheKey)
    .maybeSingle();
  const primaryPayload = primary.error ? null : (primary.data as { payload?: unknown } | null)?.payload;
  return unwrapCachedResponse(primaryPayload, now);
}

export async function writeCachedPublicResponse(cacheKey: string | null, payload: unknown) {
  if (!cacheKey) return;
  const cached: CachedPublicResponse = {
    version: 1,
    generatedAt: new Date().toISOString(),
    payload,
  };

  const primary = await supabaseAdmin
    .from("mmm_public_snapshots")
    .upsert({
      id: cacheKey,
      payload: cached,
      updated_at: cached.generatedAt,
    }, { onConflict: "id" });

  if (!primary.error) {
    return;
  }

  const latest = await supabaseAdmin
    .from("admin_audit_log")
    .select("after_state")
    .eq("action_type", "public-cache.response")
    .eq("target_type", "public-cache")
    .eq("target_id", cacheKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestPayload = latest.error ? null : (latest.data as { after_state?: unknown } | null)?.after_state;
  if (latestPayload && JSON.stringify(latestPayload) === JSON.stringify(cached)) {
    return;
  }

  await supabaseAdmin
    .from("admin_audit_log")
    .insert({
      actor_user_id: null,
      actor_role: "system",
      action_type: "public-cache.response",
      target_type: "public-cache",
      target_id: cacheKey,
      before_state: {},
      after_state: cached,
      reason: "Public MMM response cache refresh",
      created_at: cached.generatedAt,
    });
}
