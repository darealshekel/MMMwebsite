import { jsonResponse, logServerError } from "./_lib/server.js";
import { loadActiveSubscribersByUsername } from "./_lib/paypal.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const roles = await loadActiveSubscribersByUsername();
    const rolesObj: Record<string, string> = {};
    for (const [username, role] of roles) {
      rolesObj[username] = role;
    }

    return jsonResponse(
      { roles: rolesObj },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    logServerError("subscriber-roles failed", error);
    return jsonResponse({ roles: {} });
  }
}
