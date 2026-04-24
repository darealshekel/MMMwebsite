import type { MinecraftClaimSummary } from "@/lib/types";

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
  const csrfToken = getCookie("aetweaks_csrf");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
  };
}

export async function fetchMyMinecraftClaims() {
  const response = await fetch("/api/minecraft-claims/me", {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to load Minecraft claims."));
  }
  return (await response.json()) as { ok: true; claims: MinecraftClaimSummary[] };
}

export async function submitMinecraftClaim(submittedValue: string) {
  const response = await fetch("/api/minecraft-claims/submit", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders(),
    body: JSON.stringify({ submittedValue }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to submit Minecraft claim."));
  }
  return (await response.json()) as { ok: true; claim: MinecraftClaimSummary };
}

export async function fetchAdminMinecraftClaims(status = "pending") {
  const response = await fetch(`/api/admin/minecraft-claims?status=${encodeURIComponent(status)}`, {
    credentials: "include",
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
  const response = await fetch("/api/admin/minecraft-claims", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update Minecraft claim."));
  }
  return (await response.json()) as { ok: true; claim: MinecraftClaimSummary };
}
