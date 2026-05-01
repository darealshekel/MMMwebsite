import { getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError } from "../_lib/server.js";
import {
  createPayPalSubscription,
  getPlanConfig,
  isValidPlanKey,
  type PlanKey,
} from "../_lib/paypal.js";
import { supabaseAdmin, serverEnv } from "../_lib/server.js";

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
    if (!auth) {
      return response({ error: "Authentication required." }, { status: 401 });
    }

    if (!(await requireCsrf(request, auth))) {
      return response({ error: "CSRF validation failed." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      planKey?: string;
      creatorCode?: string | null;
    } | null;

    if (!body?.planKey || !isValidPlanKey(body.planKey)) {
      return response({ error: "Invalid plan." }, { status: 400 });
    }

    const planKey = body.planKey as PlanKey;
    const config = getPlanConfig(planKey)!;

    // Check for existing active subscription
    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("id,status,subscriber_role")
      .eq("user_id", auth.userId)
      .eq("status", "active")
      .maybeSingle();

    if (existingSub) {
      return response(
        { error: "You already have an active subscription." },
        { status: 409 },
      );
    }

    // Resolve creator code
    const creatorCode = await resolveCreatorCode(body.creatorCode);

    const baseUrl = serverEnv.appBaseUrl || new URL(request.url).origin;
    const returnUrl = `${baseUrl}/subscription/success?planKey=${planKey}`;
    const cancelUrl = `${baseUrl}/mod#pricing`;

    const { subscriptionId, approvalUrl } = await createPayPalSubscription({
      planKey,
      returnUrl,
      cancelUrl,
    });

    // Store pending subscription record
    await supabaseAdmin.from("subscriptions").insert({
      user_id: auth.userId,
      paypal_subscription_id: subscriptionId,
      plan_key: planKey,
      subscriber_role: config.subscriberRole,
      billing_cycle: config.billingCycle,
      status: "pending",
      creator_code: creatorCode?.code ?? null,
    });

    // Increment creator code use count
    if (creatorCode) {
      await supabaseAdmin
        .from("creator_codes")
        .update({ uses_count: creatorCode.uses_count + 1, updated_at: new Date().toISOString() })
        .eq("id", creatorCode.id);
    }

    return response({
      subscriptionId,
      approvalUrl,
      planKey,
      discountPercent: creatorCode?.discount_percent ?? 0,
    });
  } catch (error) {
    logServerError("paypal-create-subscription failed", error);
    return response({ error: "Failed to create subscription." }, { status: 500 });
  }
}
