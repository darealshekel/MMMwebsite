import { serverEnv, supabaseAdmin } from "./server.js";

const PAYPAL_BASE_URL = "https://api-m.paypal.com";

export type PlanKey =
  | "supporter_monthly"
  | "supporter_yearly"
  | "supporter_plus_monthly"
  | "supporter_plus_yearly";

export type SubscriberRole = "supporter" | "supporter_plus";

export const PLAN_CONFIGS: Record<PlanKey, {
  name: string;
  description: string;
  amount: string;
  currency: string;
  intervalUnit: "MONTH" | "YEAR";
  intervalCount: number;
  subscriberRole: SubscriberRole;
  billingCycle: "monthly" | "yearly";
}> = {
  supporter_monthly: {
    name: "Supporter Monthly",
    description: "MMManiacs Supporter – Monthly",
    amount: "2.99",
    currency: "USD",
    intervalUnit: "MONTH",
    intervalCount: 1,
    subscriberRole: "supporter",
    billingCycle: "monthly",
  },
  supporter_yearly: {
    name: "Supporter Yearly",
    description: "MMManiacs Supporter – Yearly",
    amount: "29.99",
    currency: "USD",
    intervalUnit: "YEAR",
    intervalCount: 1,
    subscriberRole: "supporter",
    billingCycle: "yearly",
  },
  supporter_plus_monthly: {
    name: "Supporter Plus Monthly",
    description: "MMManiacs Supporter Plus – Monthly",
    amount: "4.99",
    currency: "USD",
    intervalUnit: "MONTH",
    intervalCount: 1,
    subscriberRole: "supporter_plus",
    billingCycle: "monthly",
  },
  supporter_plus_yearly: {
    name: "Supporter Plus Yearly",
    description: "MMManiacs Supporter Plus – Yearly",
    amount: "49.99",
    currency: "USD",
    intervalUnit: "YEAR",
    intervalCount: 1,
    subscriberRole: "supporter_plus",
    billingCycle: "yearly",
  },
};

export function isValidPlanKey(key: string): key is PlanKey {
  return key in PLAN_CONFIGS;
}

export function getPlanConfig(key: string) {
  return PLAN_CONFIGS[key as PlanKey] ?? null;
}

async function getAccessToken(): Promise<string> {
  const credentials = btoa(`${serverEnv.paypalClientId}:${serverEnv.paypalClientSecret}`);
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal auth failed ${response.status}: ${text}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

async function paypalFetch(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<unknown> {
  const accessToken = token ?? (await getAccessToken());
  const response = await fetch(`${PAYPAL_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    throw new Error(`PayPal ${method} ${path} failed ${response.status}: ${text.slice(0, 400)}`);
  }
  return data;
}

const ENV_PLAN_IDS: Record<PlanKey, () => string> = {
  supporter_monthly:      () => serverEnv.paypalPlanSupporterMonthly,
  supporter_yearly:       () => serverEnv.paypalPlanSupporterYearly,
  supporter_plus_monthly: () => serverEnv.paypalPlanSupporterPlusMonthly,
  supporter_plus_yearly:  () => serverEnv.paypalPlanSupporterPlusYearly,
};

async function getPlanId(planKey: PlanKey, token: string): Promise<string> {
  // 1. Env var set in Vercel dashboard (pre-created plans — preferred)
  const envId = ENV_PLAN_IDS[planKey]();
  if (envId) return envId;

  // 2. DB cache from a previous auto-creation
  const { data: cached } = await supabaseAdmin
    .from("paypal_plan_cache")
    .select("paypal_plan_id")
    .eq("plan_key", planKey)
    .maybeSingle();

  if (cached?.paypal_plan_id) return cached.paypal_plan_id as string;

  // 3. Auto-create product + plan (requires Catalog Products API permission)
  const cfg = PLAN_CONFIGS[planKey];

  const product = (await paypalFetch(
    "POST",
    "/v1/catalogs/products",
    {
      name: "MMManiacs Subscription",
      description: "MMManiacs mining stats website supporter subscription",
      type: "SERVICE",
      category: "SOFTWARE",
    },
    token,
  )) as { id: string };

  const plan = (await paypalFetch(
    "POST",
    "/v1/billing/plans",
    {
      product_id: product.id,
      name: cfg.name,
      description: cfg.description,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: cfg.intervalUnit, interval_count: cfg.intervalCount },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: cfg.amount, currency_code: cfg.currency } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    },
    token,
  )) as { id: string };

  await supabaseAdmin.from("paypal_plan_cache").upsert({
    plan_key: planKey,
    paypal_product_id: product.id,
    paypal_plan_id: plan.id,
  });

  return plan.id;
}

export async function createPayPalOrder(options: {
  planKey: PlanKey;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ orderId: string; approvalUrl: string }> {
  const cfg = PLAN_CONFIGS[options.planKey];

  const order = (await paypalFetch(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: cfg.currency, value: cfg.amount },
          description: cfg.description,
          custom_id: options.planKey,
        },
      ],
      application_context: {
        brand_name: "MMManiacs",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: options.returnUrl,
        cancel_url: options.cancelUrl,
      },
    },
  )) as { id: string; links: Array<{ rel: string; href: string }> };

  const approvalLink = order.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
  if (!approvalLink) {
    throw new Error("No approval link in PayPal order response");
  }

  return { orderId: order.id, approvalUrl: approvalLink.href };
}

export async function capturePayPalOrder(orderId: string): Promise<{ status: string }> {
  const result = (await paypalFetch(
    "POST",
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {},
  )) as { status: string };
  return { status: result.status };
}

export async function getPayPalSubscription(subscriptionId: string) {
  return paypalFetch("GET", `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function cancelPayPalSubscription(subscriptionId: string, reason: string) {
  await paypalFetch(
    "POST",
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    { reason },
  );
}

export async function verifyWebhookSignature(options: {
  headers: Record<string, string>;
  rawBody: string;
}): Promise<boolean> {
  if (!serverEnv.paypalWebhookId) return false;
  try {
    const result = (await paypalFetch("POST", "/v1/notifications/verify-webhook-signature", {
      auth_algo: options.headers["paypal-auth-algo"],
      cert_url: options.headers["paypal-cert-url"],
      transmission_id: options.headers["paypal-transmission-id"],
      transmission_sig: options.headers["paypal-transmission-sig"],
      transmission_time: options.headers["paypal-transmission-time"],
      webhook_id: serverEnv.paypalWebhookId,
      webhook_event: JSON.parse(options.rawBody),
    })) as { verification_status: string };
    return result.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

// Active subscriber lookup for leaderboard enrichment
export async function loadActiveSubscribersByUsername(): Promise<Map<string, SubscriberRole>> {
  const now = new Date().toISOString();
  const { data: subs, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id,subscriber_role")
    .eq("status", "active")
    .gt("current_period_end", now);

  if (error || !subs?.length) return new Map();

  const userIds = subs.map((s) => (s as { user_id: string }).user_id);
  const roleByUserId = new Map(
    subs.map((s) => {
      const row = s as { user_id: string; subscriber_role: string };
      return [row.user_id, row.subscriber_role as SubscriberRole];
    }),
  );

  const { data: accounts } = await supabaseAdmin
    .from("connected_accounts")
    .select("user_id,minecraft_username")
    .in("user_id", userIds);

  const result = new Map<string, SubscriberRole>();
  for (const account of (accounts ?? []) as Array<{
    user_id: string;
    minecraft_username: string | null;
  }>) {
    const role = roleByUserId.get(account.user_id);
    if (role && account.minecraft_username) {
      result.set(account.minecraft_username.toLowerCase(), role);
    }
  }
  return result;
}
