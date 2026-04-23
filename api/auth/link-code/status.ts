import { getModLinkCodeStatus, LinkCodeError } from "../../_lib/mod-link.js";
import { appendCookies, jsonResponse } from "../../_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return jsonResponse({ error: "Missing browser token." }, { status: 400 });
  }

  try {
    const result = await getModLinkCodeStatus(token);
    if (result.status === "completed") {
      const headers = new Headers();
      appendCookies(headers, result.session.cookies);
      return jsonResponse({
        status: "completed",
        redirectTo: result.redirectTo,
        viewer: result.session.viewer,
      }, { headers });
    }

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof LinkCodeError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not read link code status." }, { status: 500 });
  }
}
