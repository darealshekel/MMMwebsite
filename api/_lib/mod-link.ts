import {
  encryptAtRest,
  hashDeterministicValue,
  hmac,
  randomToken,
  safeInternalPath,
  serverEnv,
  supabaseAdmin,
} from "./server.js";
import { issueSession } from "./session.js";

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type LinkCodeRow = {
  id: string;
  code: string;
  browser_token_hash: string;
  redirect_to: string;
  status: "pending" | "completed" | "expired";
  minecraft_uuid_hash?: string | null;
  minecraft_username?: string | null;
  linked_user_id?: string | null;
  claimed_client_id?: string | null;
  claimed_at?: string | null;
  expires_at: string;
  completed_session_issued_at?: string | null;
};

export class LinkCodeError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "LinkCodeError";
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function generateReadableCode(length = 8) {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    const random = crypto.getRandomValues(new Uint8Array(1))[0] % LINK_CODE_ALPHABET.length;
    code += LINK_CODE_ALPHABET[random];
  }
  return code;
}

async function hashBrowserToken(token: string) {
  return hmac(token, `browser-link:${serverEnv.sessionSecret}`);
}

export async function createModLinkCode(returnTo: string) {
  const redirectTo = safeInternalPath(returnTo, "/dashboard");
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReadableCode();
    const browserToken = randomToken(24);
    const browserTokenHash = await hashBrowserToken(browserToken);
    const inserted = await supabaseAdmin
      .from("auth_link_codes")
      .insert({
        code,
        browser_token_hash: browserTokenHash,
        redirect_to: redirectTo,
        expires_at: expiresAt.toISOString(),
      })
      .select("id,code,redirect_to,expires_at")
      .single();

    if (!inserted.error && inserted.data) {
      return {
        code: inserted.data.code as string,
        browserToken,
        redirectTo: inserted.data.redirect_to as string,
        expiresAt: inserted.data.expires_at as string,
      };
    }

    lastError = inserted.error;
    if (!String(inserted.error?.message ?? "").toLowerCase().includes("duplicate")) {
      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not create link code.");
}

export async function claimModLinkCode(input: {
  code: string;
  minecraftUuid: string;
  username: string;
  clientId?: string | null;
}) {
  const code = input.code.trim().toUpperCase();
  const username = input.username.trim();
  const minecraftUuid = input.minecraftUuid.trim().toLowerCase();

  if (!/^[A-Z2-9]{6,12}$/.test(code)) {
    throw new LinkCodeError("The link code format is invalid.");
  }
  if (!/^[0-9a-f-]{32,36}$/i.test(minecraftUuid)) {
    throw new LinkCodeError("Minecraft UUID is invalid.");
  }
  if (!username) {
    throw new LinkCodeError("Minecraft username is required.");
  }

  const challengeLookup = await supabaseAdmin
    .from("auth_link_codes")
    .select("id,code,status,redirect_to,expires_at")
    .eq("code", code)
    .maybeSingle();

  if (challengeLookup.error) throw challengeLookup.error;
  const challenge = challengeLookup.data as Pick<LinkCodeRow, "id" | "code" | "status" | "redirect_to" | "expires_at"> | null;

  if (!challenge) {
    throw new LinkCodeError("That link code was not found.", 404);
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin
      .from("auth_link_codes")
      .update({ status: "expired", updated_at: nowIso() })
      .eq("id", challenge.id);
    throw new LinkCodeError("That link code has expired. Generate a new one on the website.", 410);
  }
  if (challenge.status !== "pending") {
    throw new LinkCodeError("That link code has already been used.", 409);
  }

  const minecraftUuidHash = await hashDeterministicValue(minecraftUuid);
  const encryptedMinecraftUuid = await encryptAtRest(minecraftUuid);
  const providerAccountId = `mod:${minecraftUuidHash}`;

  const [providerLookup, uuidLookup] = await Promise.all([
    supabaseAdmin
      .from("connected_accounts")
      .select("id,user_id")
      .eq("provider_account_id", providerAccountId)
      .maybeSingle(),
    supabaseAdmin
      .from("connected_accounts")
      .select("id,user_id")
      .eq("minecraft_uuid_hash", minecraftUuidHash)
      .maybeSingle(),
  ]);

  if (providerLookup.error) throw providerLookup.error;
  if (uuidLookup.error) throw uuidLookup.error;

  let userId = providerLookup.data?.user_id ?? uuidLookup.data?.user_id ?? null;
  if (!userId) {
    const insertedUser = await supabaseAdmin.from("users").insert({}).select("id").single();
    if (insertedUser.error) throw insertedUser.error;
    userId = insertedUser.data.id as string;
  }

  const existingAccountId = providerLookup.data?.id ?? uuidLookup.data?.id ?? null;
  if (existingAccountId) {
    const updated = await supabaseAdmin
      .from("connected_accounts")
      .update({
        user_id: userId,
        provider: "mod_code",
        provider_account_id: providerAccountId,
        minecraft_uuid: encryptedMinecraftUuid,
        minecraft_uuid_hash: minecraftUuidHash,
        minecraft_username: username,
        updated_at: nowIso(),
      })
      .eq("id", existingAccountId);
    if (updated.error) throw updated.error;
  } else {
    const inserted = await supabaseAdmin.from("connected_accounts").insert({
      user_id: userId,
      provider: "mod_code",
      provider_account_id: providerAccountId,
      minecraft_uuid: encryptedMinecraftUuid,
      minecraft_uuid_hash: minecraftUuidHash,
      minecraft_username: username,
    });
    if (inserted.error) throw inserted.error;
  }

  const challengeUpdate = await supabaseAdmin
    .from("auth_link_codes")
    .update({
      status: "completed",
      linked_user_id: userId,
      minecraft_uuid_hash: minecraftUuidHash,
      minecraft_username: username,
      claimed_client_id: input.clientId?.trim() || null,
      claimed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", challenge.id);

  if (challengeUpdate.error) throw challengeUpdate.error;

  return {
    ok: true,
    username,
  };
}

export async function getModLinkCodeStatus(browserToken: string) {
  const browserTokenHash = await hashBrowserToken(browserToken);
  const lookup = await supabaseAdmin
    .from("auth_link_codes")
    .select("id,redirect_to,status,expires_at,linked_user_id,minecraft_uuid_hash,minecraft_username")
    .eq("browser_token_hash", browserTokenHash)
    .maybeSingle();

  if (lookup.error) throw lookup.error;

  const row = lookup.data as Pick<LinkCodeRow, "id" | "redirect_to" | "status" | "expires_at" | "linked_user_id" | "minecraft_uuid_hash" | "minecraft_username"> | null;
  if (!row) {
    throw new LinkCodeError("That login session was not found.", 404);
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    if (row.status === "pending") {
      await supabaseAdmin.from("auth_link_codes").update({ status: "expired", updated_at: nowIso() }).eq("id", row.id);
    }
    return {
      status: "expired" as const,
      redirectTo: row.redirect_to,
    };
  }

  if (row.status !== "completed" || !row.linked_user_id || !row.minecraft_uuid_hash || !row.minecraft_username) {
    return {
      status: "pending" as const,
      redirectTo: row.redirect_to,
      expiresAt: row.expires_at,
    };
  }

  const session = await issueSession(row.linked_user_id, {
    minecraftUsername: row.minecraft_username,
    minecraftUuidHash: row.minecraft_uuid_hash,
    provider: "mod_code",
  });

  await supabaseAdmin
    .from("auth_link_codes")
    .update({ completed_session_issued_at: nowIso(), updated_at: nowIso() })
    .eq("id", row.id);

  return {
    status: "completed" as const,
    redirectTo: row.redirect_to,
    session,
  };
}
