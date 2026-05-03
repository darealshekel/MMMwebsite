type CachedPublicResponse = {
  version: number;
  generatedAt: string;
  payload: unknown;
};

const PUBLIC_RESPONSE_CACHE_VERSION = 21;
const RESPONSE_MAX_AGE_MS = 24 * 60 * 60_000;
const RESPONSE_KEY_PREFIX = "public-response:";

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isPaginatedPublicPayloadForRequest(payload: unknown, url: URL) {
  if (!isRecord(payload)) {
    return false;
  }

  const requestedPage = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const requestedPageSize = Math.min(100, Math.max(1, toInt(url.searchParams.get("pageSize"), 30)));
  const payloadPage = Math.max(1, toInt(String(payload.page ?? ""), 1));
  const payloadPageSize = Math.min(100, Math.max(1, toInt(String(payload.pageSize ?? ""), requestedPageSize)));
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const totalRows = Math.max(0, toInt(String(payload.totalRows ?? ""), rows.length));
  const totalPages = Math.max(1, toInt(String(payload.totalPages ?? ""), Math.ceil(totalRows / requestedPageSize) || 1));

  if (payloadPage !== requestedPage || payloadPageSize !== requestedPageSize) {
    return false;
  }
  if (rows.length > requestedPageSize) {
    return false;
  }

  const expectedRowsOnPage = requestedPage < totalPages
    ? requestedPageSize
    : Math.max(0, totalRows - (requestedPage - 1) * requestedPageSize);

  return rows.length === Math.min(requestedPageSize, expectedRowsOnPage);
}

export function mainLeaderboardResponseCacheKey(url: URL) {
  if (url.searchParams.get("source") || url.searchParams.get("includeSources") === "1" || hasQuery(url) || normalizedMinBlocks(url) > 0) {
    return null;
  }

  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, toInt(url.searchParams.get("pageSize"), 30)));
  if (page === 1 && (pageSize === 20 || pageSize === 10 || pageSize === 1)) {
    return `${RESPONSE_KEY_PREFIX}leaderboard:main:p${page}:s${pageSize}`;
  }
  return null;
}

export function specialLeaderboardResponseCacheKey(url: URL) {
  const kind = url.searchParams.get("kind") ?? "";
  if ((kind !== "ssp-hsp" && kind !== "ssp" && kind !== "hsp") || hasQuery(url) || normalizedMinBlocks(url) > 0) {
    return null;
  }

  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, toInt(url.searchParams.get("pageSize"), 30)));
  return page === 1 && pageSize === 20 ? `${RESPONSE_KEY_PREFIX}leaderboard:special:${kind}:p1:s20` : null;
}

export function publicSourcesResponseCacheKey() {
  return `${RESPONSE_KEY_PREFIX}leaderboard:sources`;
}

export function landingSummaryResponseCacheKey() {
  return `${RESPONSE_KEY_PREFIX}landing:summary:v4`;
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
  if (cached.version !== PUBLIC_RESPONSE_CACHE_VERSION || cacheAgeMs(cached, now) > RESPONSE_MAX_AGE_MS) {
    return null;
  }
  return cached.payload ?? null;
}

function hasRestEnv() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

function restHeaders(extra?: HeadersInit) {
  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    ...extra,
  };
}

async function restSelectFirst(table: string, params: URLSearchParams) {
  if (!hasRestEnv()) {
    return null;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
    headers: restHeaders({ Accept: "application/json" }),
  });
  if (!response.ok) {
    return null;
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function restUpsertSnapshot(cacheKey: string, payload: CachedPublicResponse) {
  if (!hasRestEnv()) {
    return false;
  }

  const params = new URLSearchParams({ on_conflict: "id" });
  const response = await fetch(`${supabaseUrl}/rest/v1/mmm_public_snapshots?${params.toString()}`, {
    method: "POST",
    headers: restHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      id: cacheKey,
      payload,
      updated_at: payload.generatedAt,
    }),
  });
  return response.ok;
}

async function restInsertAuditSnapshot(cacheKey: string, payload: CachedPublicResponse) {
  if (!hasRestEnv()) {
    return;
  }

  await fetch(`${supabaseUrl}/rest/v1/admin_audit_log`, {
    method: "POST",
    headers: restHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify({
      actor_user_id: null,
      actor_role: "system",
      action_type: "public-cache.response",
      target_type: "public-cache",
      target_id: cacheKey,
      before_state: {},
      after_state: payload,
      reason: "Public MMM response cache refresh",
      created_at: payload.generatedAt,
    }),
  });
}

function primarySnapshotParams(cacheKey: string) {
  return new URLSearchParams({
    select: "payload",
    id: `eq.${cacheKey}`,
    limit: "1",
  });
}

function auditSnapshotParams(cacheKey: string) {
  return new URLSearchParams({
    select: "after_state",
    action_type: "eq.public-cache.response",
    target_type: "eq.public-cache",
    target_id: `eq.${cacheKey}`,
    order: "created_at.desc",
    limit: "1",
  });
}

export async function readCachedPublicResponse(cacheKey: string | null, validatePayload?: (payload: unknown) => boolean) {
  if (!cacheKey) return null;
  const now = Date.now();

  const [primary, audit] = await Promise.all([
    restSelectFirst("mmm_public_snapshots", primarySnapshotParams(cacheKey)),
    restSelectFirst("admin_audit_log", auditSnapshotParams(cacheKey)),
  ]);

  const primaryPayload = (primary as { payload?: unknown } | null)?.payload;
  const cachedPrimaryResponse = unwrapCachedResponse(primaryPayload, now);
  if (cachedPrimaryResponse && (!validatePayload || validatePayload(cachedPrimaryResponse))) {
    return cachedPrimaryResponse;
  }

  const auditPayload = (audit as { after_state?: unknown } | null)?.after_state;
  const cachedAuditResponse = unwrapCachedResponse(auditPayload, now);
  if (cachedAuditResponse && (!validatePayload || validatePayload(cachedAuditResponse))) {
    return cachedAuditResponse;
  }

  return null;
}

export async function writeCachedPublicResponse(cacheKey: string | null, payload: unknown) {
  if (!cacheKey) return;
  const cached: CachedPublicResponse = {
    version: PUBLIC_RESPONSE_CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    payload,
  };

  if (await restUpsertSnapshot(cacheKey, cached)) {
    return;
  }

  const latest = await restSelectFirst("admin_audit_log", auditSnapshotParams(cacheKey));
  const latestPayload = (latest as { after_state?: unknown } | null)?.after_state;
  if (latestPayload && JSON.stringify(latestPayload) === JSON.stringify(cached)) {
    return;
  }

  await restInsertAuditSnapshot(cacheKey, cached);
}
