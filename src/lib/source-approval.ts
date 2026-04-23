import type { SourceApprovalSummary } from "@/lib/types";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    // Ignore invalid JSON error bodies and fall back to the generic message.
  }

  return fallback;
}

export async function fetchSourceApprovals() {
  const response = await fetch("/api/admin/sources", {
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 401) {
    throw new Error(await readErrorMessage(response, "Authentication required to load source approvals."));
  }

  if (response.status === 403) {
    throw new Error(await readErrorMessage(response, "You do not have permission to review sources."));
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Unable to load source approvals (${response.status}).`));
  }

  return (await response.json()) as {
    sources: SourceApprovalSummary[];
    minimumBlocks: number;
  };
}

export async function updateSourceApproval(sourceId: string, action: "approved" | "rejected", reason?: string) {
  const csrfToken = getCookie("aetweaks_csrf");

  const response = await fetch("/api/admin/sources", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify({ sourceId, action, reason: reason?.trim() || null }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to update source approval."));
  }

  return (await response.json()) as {
    ok: true;
    sources: SourceApprovalSummary[];
    minimumBlocks: number;
  };
}

export async function deleteSource(sourceId: string, reason?: string) {
  const csrfToken = getCookie("aetweaks_csrf");

  const response = await fetch("/api/admin/sources", {
    // Some deployments/proxies drop DELETE request bodies. The API supports
    // POST + action:"delete" explicitly, so prefer that for reliability.
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify({ sourceId, action: "delete", reason: reason?.trim() || null }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to delete source."));
  }

  return (await response.json()) as {
    ok: true;
    sources: SourceApprovalSummary[];
    minimumBlocks: number;
  };
}
