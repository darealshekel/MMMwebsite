import { getAuthContext, requireCsrf } from "./_lib/session.js";
import { jsonResponse, logServerError } from "./_lib/server.js";
import { listSubmissionPageData, SubmissionError, submitUpdate } from "./_lib/submissions.js";

export const config = { runtime: "edge" };

function response(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  return jsonResponse(body, { ...init, headers });
}

export default async function handler(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return response({ error: "Authentication required." }, { status: 401 });
    }

    if (request.method === "GET") {
      return response(await listSubmissionPageData(auth));
    }

    if (request.method !== "POST") {
      return response({ error: "Method not allowed." }, { status: 405 });
    }

    if (!(await requireCsrf(request, auth))) {
      return response({ error: "CSRF validation failed." }, { status: 403 });
    }

    const formData = await request.formData();
    return response(await submitUpdate(auth, formData));
  } catch (error) {
    if (error instanceof SubmissionError) {
      return response({ error: error.message }, { status: error.status });
    }
    logServerError("submissions failed", error);
    return response({ error: "Unable to process submission." }, { status: 500 });
  }
}
