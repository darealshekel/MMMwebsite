import { getPublicSiteContent } from "./_lib/admin-management.js";
import { jsonResponse, logServerError } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler() {
  try {
    return jsonResponse({ content: await getPublicSiteContent() }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logServerError("site-content failed", error);
    return jsonResponse({ content: {} }, { status: 200 });
  }
}
