import { supabaseAdmin } from "./server.js";

export type UserIdentityRow = {
  id: string;
  username?: string | null;
  username_lower?: string | null;
  canonical_name?: string | null;
  minecraft_uuid_hash?: string | null;
  last_seen_at?: string | null;
};

const USER_IDENTITY_COLUMNS = "id,username,username_lower,canonical_name";
const USER_IDENTITY_COLUMNS_WITH_UUID = "id,username,username_lower,canonical_name,minecraft_uuid_hash,last_seen_at";
const USER_IDENTITY_FALLBACK_COLUMNS = "id,username,username_lower";
const USER_IDENTITY_FALLBACK_COLUMNS_WITH_UUID = "id,username,username_lower,minecraft_uuid_hash,last_seen_at";

function isMissingPostgrestColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = String(record.message ?? "").toLowerCase();
  return record.code === "PGRST204"
    || (message.includes("schema cache") && message.includes("canonical_name"))
    || message.includes("could not find the 'canonical_name' column")
    || message.includes("column users.canonical_name does not exist");
}

function dedupeRows(rows: UserIdentityRow[]) {
  const byId = new Map<string, UserIdentityRow>();
  for (const row of rows) {
    if (row.id && !byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export async function selectUserIdentityById(id: string) {
  const primary = await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (!primary.error || !isMissingPostgrestColumnError(primary.error)) {
    return primary as { data: UserIdentityRow | null; error: unknown | null };
  }

  return await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_FALLBACK_COLUMNS)
    .eq("id", id)
    .maybeSingle() as { data: UserIdentityRow | null; error: unknown | null };
}

export async function selectUserIdentityByUuidHash(uuidHash: string) {
  const primary = await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_COLUMNS_WITH_UUID)
    .eq("minecraft_uuid_hash", uuidHash)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!primary.error || !isMissingPostgrestColumnError(primary.error)) {
    return primary as { data: UserIdentityRow | null; error: unknown | null };
  }

  return await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_FALLBACK_COLUMNS_WITH_UUID)
    .eq("minecraft_uuid_hash", uuidHash)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: UserIdentityRow | null; error: unknown | null };
}

export async function selectUserIdentityByCanonicalName(canonicalName: string) {
  const primary = await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_COLUMNS)
    .eq("canonical_name", canonicalName)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!primary.error || !isMissingPostgrestColumnError(primary.error)) {
    return primary as { data: UserIdentityRow | null; error: unknown | null };
  }

  return await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_FALLBACK_COLUMNS)
    .eq("username_lower", canonicalName)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: UserIdentityRow | null; error: unknown | null };
}

export async function selectUserIdentitiesByIds(ids: string[]) {
  if (ids.length === 0) return { data: [] as UserIdentityRow[], error: null };

  const primary = await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_COLUMNS)
    .in("id", ids);

  if (!primary.error || !isMissingPostgrestColumnError(primary.error)) {
    return primary as { data: UserIdentityRow[] | null; error: unknown | null };
  }

  return await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_FALLBACK_COLUMNS)
    .in("id", ids) as { data: UserIdentityRow[] | null; error: unknown | null };
}

export async function selectUserIdentitiesByCanonicalNames(canonicalNames: string[]) {
  if (canonicalNames.length === 0) return { data: [] as UserIdentityRow[], error: null };

  const primary = await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_COLUMNS)
    .in("canonical_name", canonicalNames);

  if (primary.error && isMissingPostgrestColumnError(primary.error)) {
    return await supabaseAdmin
      .from("users")
      .select(USER_IDENTITY_FALLBACK_COLUMNS)
      .in("username_lower", canonicalNames) as { data: UserIdentityRow[] | null; error: unknown | null };
  }

  if (primary.error) {
    return primary as { data: UserIdentityRow[] | null; error: unknown | null };
  }

  const fallback = await supabaseAdmin
    .from("users")
    .select(USER_IDENTITY_COLUMNS)
    .in("username_lower", canonicalNames);

  if (fallback.error && isMissingPostgrestColumnError(fallback.error)) {
    const fallbackWithoutCanonical = await supabaseAdmin
      .from("users")
      .select(USER_IDENTITY_FALLBACK_COLUMNS)
      .in("username_lower", canonicalNames);
    if (fallbackWithoutCanonical.error) return fallbackWithoutCanonical as { data: UserIdentityRow[] | null; error: unknown | null };
    return {
      data: dedupeRows([...(primary.data ?? []) as UserIdentityRow[], ...(fallbackWithoutCanonical.data ?? []) as UserIdentityRow[]]),
      error: null,
    };
  }

  if (fallback.error) return fallback as { data: UserIdentityRow[] | null; error: unknown | null };

  return {
    data: dedupeRows([...(primary.data ?? []) as UserIdentityRow[], ...(fallback.data ?? []) as UserIdentityRow[]]),
    error: null,
  };
}

export async function insertUserIdentity(input: {
  clientId: string;
  username: string;
  canonicalName: string;
  minecraftUuidHash: string | null;
  now: string;
}) {
  const payload = {
    client_id: input.clientId,
    username: input.username,
    username_lower: input.canonicalName,
    canonical_name: input.canonicalName,
    minecraft_uuid_hash: input.minecraftUuidHash,
    last_seen_at: input.now,
    updated_at: input.now,
  };

  const primary = await supabaseAdmin
    .from("users")
    .insert(payload)
    .select(USER_IDENTITY_COLUMNS)
    .single();

  if (!primary.error || !isMissingPostgrestColumnError(primary.error)) {
    return primary as { data: UserIdentityRow | null; error: unknown | null };
  }

  const { canonical_name: _canonicalName, ...fallbackPayload } = payload;
  return await supabaseAdmin
    .from("users")
    .insert(fallbackPayload)
    .select(USER_IDENTITY_FALLBACK_COLUMNS)
    .single() as { data: UserIdentityRow | null; error: unknown | null };
}

