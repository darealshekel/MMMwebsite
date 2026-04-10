import type { SourceApprovalSummary } from "@/lib/types";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function fetchSourceApprovals() {
  const response = await fetch("/api/admin/sources", {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 401 || response.status === 403) {
    return {
      sources: [] as SourceApprovalSummary[],
      minimumBlocks: 1_000_000,
    };
  }

  if (!response.ok) {
    throw new Error("Unable to load source approvals.");
  }

  return (await response.json()) as {
    sources: SourceApprovalSummary[];
    minimumBlocks: number;
  };
}

export async function updateSourceApproval(sourceId: string, action: "approved" | "rejected") {
  const csrfToken = getCookie("ae_csrf");

  const response = await fetch("/api/admin/sources", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify({ sourceId, action }),
  });

  if (!response.ok) {
    throw new Error("Unable to update source approval.");
  }

  return (await response.json()) as {
    ok: true;
    sources: SourceApprovalSummary[];
    minimumBlocks: number;
  };
}
