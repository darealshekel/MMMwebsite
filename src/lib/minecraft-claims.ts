import type { MinecraftClaimSummary } from "@/lib/types";
import { LEGACY_CSRF_COOKIE } from "@/lib/legacy-auth-cookies";
import { apiCredentials, apiUrl, isLocalProductionPreview } from "@/lib/local-runtime";
import { buildNmsrFaceUrl } from "../../shared/player-avatar";

function localApprovedClaim(): MinecraftClaimSummary {
  const now = new Date().toISOString();
  return {
    id: "local-claim-5hekel",
    userId: "local-owner",
    discord: {
      id: "local-dev-discord",
      username: "5hekel",
      avatar: buildNmsrFaceUrl("5hekel"),
    },
    minecraftUuid: "00000000-0000-0000-0000-000000005000",
    minecraftName: "5hekel",
    submittedValue: "5hekel",
    status: "approved",
    submittedAt: now,
    reviewedAt: now,
    reviewedByUserId: "local-owner",
    rejectionReason: null,
  };
}

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    // fall through
  }
  return fallback;
}

function jsonHeaders() {
  const csrfToken = getCookie(LEGACY_CSRF_COOKIE);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
  };
}

export async function fetchMyMinecraftClaims() {
  if (isLocalProductionPreview()) {
    return { ok: true as const, claims: [localApprovedClaim()] };
  }

  const response = await fetch(apiUrl("/api/minecraft-claims/me"), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to load Minecraft claims."));
  }
  return (await response.json()) as { ok: true; claims: MinecraftClaimSummary[] };
}

export async function submitMinecraftClaim(submittedValue: string) {
  const response = await fetch(apiUrl("/api/minecraft-claims/submit"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: jsonHeaders(),
    body: JSON.stringify({ submittedValue }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to submit Minecraft claim."));
  }
  return (await response.json()) as { ok: true; claim: MinecraftClaimSummary };
}

export async function fetchAdminMinecraftClaims(status = "pending") {
  if (isLocalProductionPreview()) {
    return { ok: true as const, claims: [] };
  }

  const response = await fetch(apiUrl(`/api/admin/minecraft-claims?status=${encodeURIComponent(status)}`), {
    credentials: apiCredentials(),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to load admin Minecraft claims."));
  }
  return (await response.json()) as { ok: true; claims: MinecraftClaimSummary[] };
}

export async function updateAdminMinecraftClaim(input: {
  claimId: string;
  action: "approve" | "reject" | "unlink" | "transfer";
  reason?: string;
  targetUserId?: string;
}) {
  const response = await fetch(apiUrl("/api/admin/minecraft-claims"), {
    method: "POST",
    credentials: apiCredentials(),
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update Minecraft claim."));
  }
  return (await response.json()) as { ok: true; claim: MinecraftClaimSummary };
}
