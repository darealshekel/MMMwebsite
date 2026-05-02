import { jsonResponse, logServerError } from "../_lib/server.js";
import { supabaseAdmin } from "../_lib/server.js";
import { verifyWebhookSignature, getPlanConfig } from "../_lib/paypal.js";

export const config = { runtime: "edge" };

type PayPalWebhookEvent = {
  event_type: string;
  resource: {
    id?: string;
    status?: string;
    plan_id?: string;
    billing_info?: {
      next_billing_time?: string;
      last_payment?: { time?: string };
    };
    supplementary_data?: {
      related_ids?: { order_id?: string };
    };
  };
};

function getNextPeriodEnd(event: PayPalWebhookEvent): string | null {
  const nextTime = event.resource.billing_info?.next_billing_time;
  if (nextTime) return nextTime;
  // Fallback: add 1 month/year based on plan
  return null;
}

async function handleSubscriptionActivated(event: PayPalWebhookEvent) {
  const subscriptionId = event.resource.id;
  if (!subscriptionId) return;

  const periodEnd = getNextPeriodEnd(event);
  const now = new Date().toISOString();

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id,user_id,plan_key,subscriber_role,billing_cycle")
    .eq("paypal_subscription_id", subscriptionId)
    .maybeSingle();

  if (!sub) return;

  const row = sub as {
    id: string;
    user_id: string;
    plan_key: string;
    subscriber_role: string;
    billing_cycle: string;
  };

  // Calculate period end if PayPal didn't provide it
  let periodEndFinal = periodEnd;
  if (!periodEndFinal) {
    const config = getPlanConfig(row.plan_key);
    if (config) {
      const end = new Date();
      if (config.billingCycle === "yearly") {
        end.setFullYear(end.getFullYear() + 1);
      } else {
        end.setMonth(end.getMonth() + 1);
      }
      periodEndFinal = end.toISOString();
    }
  }

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_start: now,
      current_period_end: periodEndFinal,
      updated_at: now,
    })
    .eq("id", row.id);
}

async function handleSubscriptionRenewed(event: PayPalWebhookEvent) {
  const subscriptionId = event.resource.id;
  if (!subscriptionId) return;

  const periodEnd = getNextPeriodEnd(event);
  const now = new Date().toISOString();

  const updateData: Record<string, string> = { updated_at: now };
  if (periodEnd) updateData.current_period_end = periodEnd;

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "active", ...updateData })
    .eq("paypal_subscription_id", subscriptionId);
}

async function handleSubscriptionCancelled(event: PayPalWebhookEvent) {
  const subscriptionId = event.resource.id;
  if (!subscriptionId) return;

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("paypal_subscription_id", subscriptionId);
}

async function handleSubscriptionSuspended(event: PayPalWebhookEvent) {
  const subscriptionId = event.resource.id;
  if (!subscriptionId) return;

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "suspended", updated_at: new Date().toISOString() })
    .eq("paypal_subscription_id", subscriptionId);
}

async function handleSubscriptionExpired(event: PayPalWebhookEvent) {
  const subscriptionId = event.resource.id;
  if (!subscriptionId) return;

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("paypal_subscription_id", subscriptionId);
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const rawBody = await request.text();

    const headers: Record<string, string> = {};
    for (const key of [
      "paypal-auth-algo",
      "paypal-cert-url",
      "paypal-transmission-id",
      "paypal-transmission-sig",
      "paypal-transmission-time",
    ]) {
      const value = request.headers.get(key);
      if (value) headers[key] = value;
    }

    const valid = await verifyWebhookSignature({ headers, rawBody });
    if (!valid) {
      return jsonResponse({ error: "Invalid webhook signature." }, { status: 401 });
    }

    const event = JSON.parse(rawBody) as PayPalWebhookEvent;

    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        // Backup activation in case client-side capture call failed
        const orderId = event.resource.supplementary_data?.related_ids?.order_id;
        if (orderId) {
          const { data: sub } = await supabaseAdmin
            .from("subscriptions")
            .select("id,plan_key,billing_cycle,status")
            .eq("paypal_subscription_id", orderId)
            .maybeSingle();
          if (sub && (sub as { status: string }).status === "pending") {
            const row = sub as { id: string; plan_key: string; billing_cycle: string };
            const now = new Date();
            const periodEnd = new Date(now);
            const cfg = getPlanConfig(row.plan_key);
            if (cfg?.billingCycle === "yearly") {
              periodEnd.setFullYear(periodEnd.getFullYear() + 1);
            } else {
              periodEnd.setMonth(periodEnd.getMonth() + 1);
            }
            await supabaseAdmin.from("subscriptions").update({
              status: "active",
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              updated_at: now.toISOString(),
            }).eq("id", row.id);
          }
        }
        break;
      }
      case "BILLING.SUBSCRIPTION.ACTIVATED":
        await handleSubscriptionActivated(event);
        break;
      case "BILLING.SUBSCRIPTION.RENEWED":
      case "PAYMENT.SALE.COMPLETED":
        await handleSubscriptionRenewed(event);
        break;
      case "BILLING.SUBSCRIPTION.CANCELLED":
        await handleSubscriptionCancelled(event);
        break;
      case "BILLING.SUBSCRIPTION.SUSPENDED":
        await handleSubscriptionSuspended(event);
        break;
      case "BILLING.SUBSCRIPTION.EXPIRED":
        await handleSubscriptionExpired(event);
        break;
      default:
        break;
    }

    return jsonResponse({ received: true });
  } catch (error) {
    logServerError("paypal-webhook failed", error);
    return jsonResponse({ error: "Webhook processing error." }, { status: 500 });
  }
}
