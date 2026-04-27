import { getPublicSiteContent } from "./_lib/admin-management.js";
import { jsonResponse, logServerError } from "./_lib/server.js";

export const config = { runtime: "edge" };

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};
const siteContentTimeoutMs = 250;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export default async function handler() {
  try {
    const content = await withTimeout(getPublicSiteContent(), siteContentTimeoutMs, "site content lookup timed out");
    return jsonResponse({ content }, {
      headers: publicCacheHeaders,
    });
  } catch (error) {
    logServerError("site-content failed", error);
    return jsonResponse({ content: {} }, {
      status: 200,
      headers: {
        ...publicCacheHeaders,
        "X-MMM-Site-Content-Fallback": "1",
      },
    });
  }
}
