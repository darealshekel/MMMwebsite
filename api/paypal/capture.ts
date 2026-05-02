import { getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError, supabaseAdmin } from "../_lib/server.js";
import { capturePayPalOrder, getPlanConfig } from "../_lib/paypal.js";

export const config = { runtime: "edge" };

function response(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return jsonResponse(body, { ...init, headers });
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return response({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const auth = await getAuthContext(request);
    if (!auth) return response({ error: "Authentication required." }, { status: 401 });

    if (!(await requireCsrf(request, auth))) {
      return response({ error: "CSRF validation failed." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
    if (!body?.orderId) {
      return response({ error: "orderId is required." }, { status: 400 });
    }

    // Find the pending subscription for this order
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id,plan_key,billing_cycle,status")
      .eq("paypal_subscription_id", body.orderId)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (!sub) {
      return response({ error: "No pending subscription found for this order." }, { status: 404 });
    }

    const row = sub as { id: string; plan_key: string; billing_cycle: string; status: string };

    // Already activated (e.g. webhook beat us to it)
    if (row.status === "active") {
      return response({ success: true, alreadyActive: true });
    }

    // Capture the payment
    const captured = await capturePayPalOrder(body.orderId);
    if (captured.status !== "COMPLETED") {
      return response({ error: `Payment not completed: ${captured.status}` }, { status: 400 });
    }

    // Calculate subscription period
    const now = new Date();
    const periodEnd = new Date(now);
    const cfg = getPlanConfig(row.plan_key);
    if (cfg?.billingCycle === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", row.id);

    return response({ success: true });
  } catch (error) {
    logServerError("paypal-capture failed", error);
    const message = error instanceof Error ? error.message : "Failed to capture payment.";
    return response({ error: message }, { status: 500 });
  }
}
