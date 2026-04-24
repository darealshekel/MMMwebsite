import {
  formatMinecraftUuid,
  isManagementRole,
  normalizeMinecraftUuid,
  sanitizeRejectReason,
  sanitizeEditableText,
} from "../../shared/admin-management.js";
import type { AuthContext } from "./session.js";
import {
  encryptAtRest,
  hashDeterministicValue,
  supabaseAdmin,
} from "./server.js";
import { insertAdminAuditLog } from "./admin-management.js";

export class MinecraftClaimError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MinecraftClaimError";
    this.status = status;
  }
}

type ClaimStatus = "pending" | "approved" | "rejected";

type ClaimRow = {
  id: string;
  user_id: string;
  minecraft_uuid: string;
  minecraft_uuid_hash: string;
  minecraft_name: string;
  submitted_value: string;
  status: ClaimStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  rejection_reason: string | null;
  created_at?: string;
  updated_at?: string;
};

type UserRow = {
  id: string;
  profile_preferences?: unknown;
};

function requireManagementAccess(auth: AuthContext) {
  if (!isManagementRole(auth.viewer.role) && auth.viewer.isAdmin !== true) {
    throw new MinecraftClaimError("You do not have permission to manage Minecraft claims.", 403);
  }
}

function parsePreferences(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function discordSummary(preferences: Record<string, unknown>) {
  const discord = preferences.discord && typeof preferences.discord === "object" && !Array.isArray(preferences.discord)
    ? preferences.discord as Record<string, unknown>
    : {};

  return {
    id: typeof discord.id === "string" ? discord.id : null,
    username: typeof discord.username === "string" ? discord.username : null,
    avatar: typeof discord.avatar === "string" ? discord.avatar : null,
  };
}

function mapClaim(row: ClaimRow, user?: UserRow | null) {
  const discord = user ? discordSummary(parsePreferences(user.profile_preferences)) : { id: null, username: null, avatar: null };
  return {
    id: row.id,
    userId: row.user_id,
    discord,
    minecraftUuid: formatMinecraftUuid(row.minecraft_uuid) ?? row.minecraft_uuid,
    minecraftName: row.minecraft_name,
    submittedValue: row.submitted_value,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedByUserId: row.reviewed_by_user_id,
    rejectionReason: row.rejection_reason,
  };
}

function isMinecraftName(value: string) {
  return /^[A-Za-z0-9_]{3,16}$/.test(value);
}

export async function resolveMinecraftInput(rawInput: string) {
  const submittedValue = sanitizeEditableText(rawInput, 80);
  if (!submittedValue) {
    throw new MinecraftClaimError("Enter a Minecraft username or UUID.", 400);
  }

  const normalizedUuid = normalizeMinecraftUuid(submittedValue);
  if (normalizedUuid) {
    const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${normalizedUuid}`, {
      headers: { Accept: "application/json" },
    });
    const payload = response.ok
      ? await response.json().catch(() => null) as { id?: string; name?: string } | null
      : null;

    return {
      submittedValue,
      minecraftUuid: normalizeMinecraftUuid(payload?.id ?? normalizedUuid) ?? normalizedUuid,
      minecraftName: sanitizeEditableText(payload?.name ?? submittedValue, 32) || submittedValue,
    };
  }

  if (!isMinecraftName(submittedValue)) {
    throw new MinecraftClaimError("Minecraft name must be 3-16 characters, or enter a valid UUID.", 400);
  }

  const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(submittedValue)}`, {
    headers: { Accept: "application/json" },
  });
  if (response.status === 204 || response.status === 404) {
    throw new MinecraftClaimError("Mojang could not find that Minecraft username.", 404);
  }

  const payload = await response.json().catch(() => null) as { id?: string; name?: string } | null;
  const uuid = normalizeMinecraftUuid(payload?.id ?? "");
  const name = sanitizeEditableText(payload?.name ?? "", 32);
  if (!response.ok || !uuid || !name) {
    throw new MinecraftClaimError("Mojang profile lookup failed.", 502);
  }

  return {
    submittedValue,
    minecraftUuid: uuid,
    minecraftName: name,
  };
}

async function loadUsersById(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, UserRow>();
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,profile_preferences")
    .in("id", [...new Set(userIds)]);
  if (error) throw error;
  return new Map(((data ?? []) as UserRow[]).map((row) => [row.id, row]));
}

export async function listMyMinecraftClaims(auth: AuthContext) {
  const { data, error } = await supabaseAdmin
    .from("minecraft_profile_claims")
    .select("*")
    .eq("user_id", auth.userId)
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  const usersById = await loadUsersById([auth.userId]);
  return {
    ok: true as const,
    claims: ((data ?? []) as ClaimRow[]).map((row) => mapClaim(row, usersById.get(row.user_id))),
  };
}

export async function submitMinecraftClaim(auth: AuthContext, input: { submittedValue: string }) {
  const resolved = await resolveMinecraftInput(input.submittedValue);
  const minecraftUuidHash = await hashDeterministicValue(resolved.minecraftUuid);

  const [duplicateLookup, approvedForUserLookup] = await Promise.all([
    supabaseAdmin
      .from("minecraft_profile_claims")
      .select("id,user_id,status,minecraft_name")
      .eq("minecraft_uuid_hash", minecraftUuidHash)
      .in("status", ["pending", "approved"])
      .limit(5),
    supabaseAdmin
      .from("minecraft_profile_claims")
      .select("id,minecraft_name,minecraft_uuid,status")
      .eq("user_id", auth.userId)
      .eq("status", "approved")
      .limit(5),
  ]);
  if (duplicateLookup.error) throw duplicateLookup.error;
  if (approvedForUserLookup.error) throw approvedForUserLookup.error;

  const duplicate = (duplicateLookup.data ?? [])[0] as { id: string; user_id: string; status: ClaimStatus; minecraft_name: string } | undefined;
  if (duplicate) {
    if (duplicate.user_id === auth.userId) {
      throw new MinecraftClaimError(`You already have a ${duplicate.status} claim for ${duplicate.minecraft_name}.`, 409);
    }
    throw new MinecraftClaimError("That Minecraft UUID already has an active claim.", 409);
  }

  if (!isManagementRole(auth.viewer.role) && auth.viewer.isAdmin !== true && (approvedForUserLookup.data ?? []).length > 0) {
    throw new MinecraftClaimError("You already have an approved Minecraft profile linked.", 409);
  }

  const now = new Date().toISOString();
  const inserted = await supabaseAdmin
    .from("minecraft_profile_claims")
    .insert({
      user_id: auth.userId,
      minecraft_uuid: resolved.minecraftUuid,
      minecraft_uuid_hash: minecraftUuidHash,
      minecraft_name: resolved.minecraftName,
      submitted_value: resolved.submittedValue,
      status: "pending",
      submitted_at: now,
    })
    .select("*")
    .single();
  if (inserted.error) throw inserted.error;

  return {
    ok: true as const,
    claim: mapClaim(inserted.data as ClaimRow, null),
  };
}

export async function listMinecraftClaimsForAdmin(auth: AuthContext, status: string | null) {
  requireManagementAccess(auth);
  let query = supabaseAdmin
    .from("minecraft_profile_claims")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (status === "pending" || status === "approved" || status === "rejected") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ClaimRow[];
  const usersById = await loadUsersById(rows.map((row) => row.user_id));
  return {
    ok: true as const,
    claims: rows.map((row) => mapClaim(row, usersById.get(row.user_id))),
  };
}

async function getClaimForReview(claimId: string) {
  const { data, error } = await supabaseAdmin
    .from("minecraft_profile_claims")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new MinecraftClaimError("Minecraft claim not found.", 404);
  }
  return data as ClaimRow;
}

export async function approveMinecraftClaim(auth: AuthContext, claimId: string) {
  requireManagementAccess(auth);
  const claim = await getClaimForReview(claimId);
  const now = new Date().toISOString();
  const encryptedUuid = await encryptAtRest(claim.minecraft_uuid);

  const accountUpsert = await supabaseAdmin
    .from("connected_accounts")
    .upsert({
      user_id: claim.user_id,
      provider: "discord_claim",
      provider_account_id: `discord_claim:${claim.minecraft_uuid_hash}`,
      minecraft_uuid: encryptedUuid,
      minecraft_uuid_hash: claim.minecraft_uuid_hash,
      minecraft_username: claim.minecraft_name,
      updated_at: now,
    }, { onConflict: "minecraft_uuid_hash" });
  if (accountUpsert.error) throw accountUpsert.error;

  const updateClaim = await supabaseAdmin
    .from("minecraft_profile_claims")
    .update({
      status: "approved",
      reviewed_at: now,
      reviewed_by_user_id: auth.userId,
      rejection_reason: null,
      updated_at: now,
    })
    .eq("id", claim.id)
    .select("*")
    .single();
  if (updateClaim.error) throw updateClaim.error;

  const rejectDuplicates = await supabaseAdmin
    .from("minecraft_profile_claims")
    .update({
      status: "rejected",
      reviewed_at: now,
      reviewed_by_user_id: auth.userId,
      rejection_reason: "Another claim for this Minecraft UUID was approved.",
      updated_at: now,
    })
    .eq("minecraft_uuid_hash", claim.minecraft_uuid_hash)
    .neq("id", claim.id)
    .eq("status", "pending");
  if (rejectDuplicates.error) throw rejectDuplicates.error;

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "minecraft-claim.approve",
    targetType: "minecraft-claim",
    targetId: claim.id,
    targetUuidHash: claim.minecraft_uuid_hash,
    beforeState: { status: claim.status, userId: claim.user_id },
    afterState: { status: "approved", userId: claim.user_id, minecraftName: claim.minecraft_name },
  });

  return { ok: true as const, claim: mapClaim(updateClaim.data as ClaimRow, null) };
}

export async function rejectMinecraftClaim(auth: AuthContext, claimId: string, reason: string | null) {
  requireManagementAccess(auth);
  const claim = await getClaimForReview(claimId);
  const now = new Date().toISOString();
  const rejectionReason = sanitizeRejectReason(reason ?? "") || null;

  const updated = await supabaseAdmin
    .from("minecraft_profile_claims")
    .update({
      status: "rejected",
      reviewed_at: now,
      reviewed_by_user_id: auth.userId,
      rejection_reason: rejectionReason,
      updated_at: now,
    })
    .eq("id", claim.id)
    .select("*")
    .single();
  if (updated.error) throw updated.error;

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "minecraft-claim.reject",
    targetType: "minecraft-claim",
    targetId: claim.id,
    targetUuidHash: claim.minecraft_uuid_hash,
    beforeState: { status: claim.status },
    afterState: { status: "rejected" },
    reason: rejectionReason,
  });

  return { ok: true as const, claim: mapClaim(updated.data as ClaimRow, null) };
}

export async function unlinkMinecraftClaim(auth: AuthContext, claimId: string, reason: string | null) {
  requireManagementAccess(auth);
  const claim = await getClaimForReview(claimId);
  const now = new Date().toISOString();
  const rejectionReason = sanitizeRejectReason(reason ?? "") || "Unlinked by admin.";

  const [claimUpdate, accountDelete] = await Promise.all([
    supabaseAdmin
      .from("minecraft_profile_claims")
      .update({
        status: "rejected",
        reviewed_at: now,
        reviewed_by_user_id: auth.userId,
        rejection_reason: rejectionReason,
        updated_at: now,
      })
      .eq("id", claim.id)
      .select("*")
      .single(),
    supabaseAdmin
      .from("connected_accounts")
      .delete()
      .eq("user_id", claim.user_id)
      .eq("minecraft_uuid_hash", claim.minecraft_uuid_hash)
      .eq("provider", "discord_claim"),
  ]);
  if (claimUpdate.error) throw claimUpdate.error;
  if (accountDelete.error) throw accountDelete.error;

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "minecraft-claim.unlink",
    targetType: "minecraft-claim",
    targetId: claim.id,
    targetUuidHash: claim.minecraft_uuid_hash,
    beforeState: { status: claim.status, userId: claim.user_id },
    afterState: { status: "rejected" },
    reason: rejectionReason,
  });

  return { ok: true as const, claim: mapClaim(claimUpdate.data as ClaimRow, null) };
}

export async function transferMinecraftClaim(auth: AuthContext, claimId: string, targetUserId: string) {
  requireManagementAccess(auth);
  const claim = await getClaimForReview(claimId);
  const trimmedTargetUserId = sanitizeEditableText(targetUserId, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedTargetUserId)) {
    throw new MinecraftClaimError("Target user id must be a valid UUID.", 400);
  }

  const userLookup = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", trimmedTargetUserId)
    .maybeSingle();
  if (userLookup.error) throw userLookup.error;
  if (!userLookup.data) {
    throw new MinecraftClaimError("Target website user was not found.", 404);
  }

  const now = new Date().toISOString();
  const updated = await supabaseAdmin
    .from("minecraft_profile_claims")
    .update({ user_id: trimmedTargetUserId, updated_at: now })
    .eq("id", claim.id)
    .select("*")
    .single();
  if (updated.error) throw updated.error;

  if (claim.status === "approved") {
    const accountUpdate = await supabaseAdmin
      .from("connected_accounts")
      .update({ user_id: trimmedTargetUserId, updated_at: now })
      .eq("minecraft_uuid_hash", claim.minecraft_uuid_hash)
      .eq("provider", "discord_claim");
    if (accountUpdate.error) throw accountUpdate.error;
  }

  await insertAdminAuditLog({
    actorUserId: auth.userId,
    actorRole: auth.viewer.role,
    actionType: "minecraft-claim.transfer",
    targetType: "minecraft-claim",
    targetId: claim.id,
    targetUuidHash: claim.minecraft_uuid_hash,
    beforeState: { userId: claim.user_id },
    afterState: { userId: trimmedTargetUserId },
  });

  return { ok: true as const, claim: mapClaim(updated.data as ClaimRow, null) };
}
