import type { SubmitPageData, SubmitSubmissionSummary, SubmitSubmissionType } from "@/lib/types";
import { LEGACY_CSRF_COOKIE } from "@/lib/legacy-auth-cookies";

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

export async function fetchSubmitPageData() {
  const response = await fetch("/api/submissions", {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to load submit page data."));
  }

  return (await response.json()) as SubmitPageData;
}

export async function submitMiningUpdate(input: {
  type: SubmitSubmissionType;
  sourceId?: string;
  sourceName?: string;
  sourceType?: string;
  blocksMined: number;
  playerRows?: Array<{ username: string; blocksMined: number }>;
  proof: File;
  logoUrl?: string;
}) {
  const formData = new FormData();
  formData.set("type", input.type);
  formData.set("blocksMined", String(input.blocksMined));
  formData.set("proof", input.proof);
  if (input.sourceId) formData.set("sourceId", input.sourceId);
  if (input.sourceName) formData.set("sourceName", input.sourceName);
  if (input.sourceType) formData.set("sourceType", input.sourceType);
  if (input.playerRows) formData.set("playerRows", JSON.stringify(input.playerRows));
  if (input.logoUrl) formData.set("logoUrl", input.logoUrl);

  const response = await fetch("/api/submissions", {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "x-csrf-token": getCookie(LEGACY_CSRF_COOKIE) ?? "",
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Unable to submit update."));
  }

  return (await response.json()) as { ok: true; submission: SubmitSubmissionSummary };
}
