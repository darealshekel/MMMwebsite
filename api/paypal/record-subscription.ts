import { getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError, supabaseAdmin } from "../_lib/server.js";
import { getPlanConfig, isValidPlanKey, type PlanKey } from "../_lib/paypal.js";

export const config = { runtime: "edge" };

function response(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return jsonResponse(body, { ...init, headers });
}

async function resolveCreatorCode(code: string | null | undefined) {
  if (!code?.trim()) return null;
  const normalized = code.trim().toUpperCase();
  const { data } = await supabaseAdmin
    .from("creator_codes")
    .select("id,code,discount_percent,is_active,uses_count")
    .eq("code", normalized)
    .maybeSingle();
  if (!data || !(data as { is_active: boolean }).is_active) return null;
  return data as { id: string; code: string; discount_percent: number; uses_count: number };
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

    const body = (await request.json().catch(() => null)) as {
      subscriptionId?: string;
      planKey?: string;
      creatorCode?: string | null;
    } | null;

    if (!body?.subscriptionId || !body?.planKey || !isValidPlanKey(body.planKey)) {
      return response({ error: "subscriptionId and valid planKey are required." }, { status: 400 });
    }

    const planKey = body.planKey as PlanKey;
    const planConfig = getPlanConfig(planKey)!;

    // Idempotent: already recorded
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("paypal_subscription_id", body.subscriptionId)
      .maybeSingle();
    if (existing) return response({ success: true });

    // Block duplicate active subscriptions
    const { data: activeSub } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("status", "active")
      .maybeSingle();
    if (activeSub) {
      return response({ error: "You already have an active subscription." }, { status: 409 });
    }

    const creatorCode = await resolveCreatorCode(body.creatorCode);

    await supabaseAdmin.from("subscriptions").insert({
      user_id: auth.userId,
      paypal_subscription_id: body.subscriptionId,
      plan_key: planKey,
      subscriber_role: planConfig.subscriberRole,
      billing_cycle: planConfig.billingCycle,
      status: "pending",
      creator_code: creatorCode?.code ?? null,
    });

    if (creatorCode) {
      await supabaseAdmin
        .from("creator_codes")
        .update({ uses_count: creatorCode.uses_count + 1, updated_at: new Date().toISOString() })
        .eq("id", creatorCode.id);
    }

    return response({ success: true });
  } catch (error) {
    logServerError("paypal-record-subscription failed", error);
    return response({ error: "Failed to record subscription." }, { status: 500 });
  }
}
