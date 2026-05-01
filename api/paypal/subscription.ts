import { getAuthContext } from "../_lib/session.js";
import { jsonResponse, logServerError } from "../_lib/server.js";
import { supabaseAdmin } from "../_lib/server.js";

export const config = { runtime: "edge" };

function response(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return jsonResponse(body, { ...init, headers });
}

export default async function handler(request: Request) {
  if (request.method !== "GET") {
    return response({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return response({ authenticated: false }, { status: 401 });
    }

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id,plan_key,subscriber_role,billing_cycle,status,current_period_start,current_period_end,creator_code")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get user balance
    const { data: balance } = await supabaseAdmin
      .from("user_balances")
      .select("balance_cents")
      .eq("user_id", auth.userId)
      .maybeSingle();

    return response({
      subscription: sub ?? null,
      balanceCents: (balance as { balance_cents: number } | null)?.balance_cents ?? 0,
    });
  } catch (error) {
    logServerError("paypal-subscription failed", error);
    return response({ error: "Failed to fetch subscription." }, { status: 500 });
  }
}
