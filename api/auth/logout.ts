import { destroySession } from "../_lib/session.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const headers = new Headers({ Location: "/", "Cache-Control": "no-store" });
  for (const cookie of await destroySession(request)) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status: 302, headers });
}
