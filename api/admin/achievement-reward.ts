import { getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError, supabaseAdmin } from "../_lib/server.js";
import { isOwnerRole } from "../../shared/admin-management.js";

export const config = { runtime: "edge" };

// Monetary value for each achievement (in cents)
const ACHIEVEMENT_VALUES: Record<string, { amountCents: number; subscriberRole: "supporter" | "supporter_plus" }> = {
  "yearly-champion":        { amountCents: 4999, subscriberRole: "supporter_plus" },
  "yearly-podium-2":        { amountCents: 4999, subscriberRole: "supporter_plus" },
  "yearly-podium-3":        { amountCents: 4999, subscriberRole: "supporter_plus" },
  "yearly-elite":           { amountCents: 2999, subscriberRole: "supporter" },
  "part-of-the-mod":        { amountCents: 2994, subscriberRole: "supporter_plus" },
  "no-life":                { amountCents: 1794, subscriberRole: "supporter" },
  "eternal-miner":          { amountCents:  499, subscriberRole: "supporter_plus" },
  "unstoppable":            { amountCents:  299, subscriberRole: "supporter" },
  "singular-obsession":     { amountCents:  499, subscriberRole: "supporter_plus" },
  "a-focused-one-indeed":   { amountCents:  299, subscriberRole: "supporter" },
  "50m-digs":               { amountCents:  299, subscriberRole: "supporter" },
  "100m-digs":              { amountCents:  598, subscriberRole: "supporter" },
  "150m-digs":              { amountCents:  897, subscriberRole: "supporter" },
  "200m-digs":              { amountCents: 1794, subscriberRole: "supporter" },
  "250m-digs":              { amountCents:  998, subscriberRole: "supporter_plus" },
  "300m-digs":              { amountCents:  998, subscriberRole: "supporter_plus" },
  "350m-digs":              { amountCents:  998, subscriberRole: "supporter_plus" },
  "400m-digs":              { amountCents:  998, subscriberRole: "supporter_plus" },
  "450m-digs":              { amountCents:  998, subscriberRole: "supporter_plus" },
  "500m-digs":              { amountCents: 2994, subscriberRole: "supporter_plus" },
};

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
    if (!isOwnerRole(auth.viewer.role)) return response({ error: "Owner access required." }, { status: 403 });

    if (!(await requireCsrf(request, auth))) {
      return response({ error: "CSRF validation failed." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      userId?: string;
      achievementKey?: string;
    } | null;

    if (!body?.userId || !body?.achievementKey) {
      return response({ error: "userId and achievementKey are required." }, { status: 400 });
    }

    const achievementConfig = ACHIEVEMENT_VALUES[body.achievementKey];
    if (!achievementConfig) {
      return response({ error: "Unknown achievement key.", validKeys: Object.keys(ACHIEVEMENT_VALUES) }, { status: 400 });
    }

    // Check for duplicate credit
    const { data: existing } = await supabaseAdmin
      .from("achievement_credits")
      .select("id")
      .eq("user_id", body.userId)
      .eq("achievement_key", body.achievementKey)
      .maybeSingle();

    if (existing) {
      return response({ error: "Achievement already credited for this user." }, { status: 409 });
    }

    // Check if user has an active subscription
    const { data: activeSub } = await supabaseAdmin
      .from("subscriptions")
      .select("id,subscriber_role")
      .eq("user_id", body.userId)
      .eq("status", "active")
      .gt("current_period_end", new Date().toISOString())
      .maybeSingle();

    const now = new Date().toISOString();

    if (activeSub) {
      // User has active subscription → credit their balance
      const { data: existingBalance } = await supabaseAdmin
        .from("user_balances")
        .select("balance_cents")
        .eq("user_id", body.userId)
        .maybeSingle();

      const currentBalance = (existingBalance as { balance_cents: number } | null)?.balance_cents ?? 0;
      const newBalance = currentBalance + achievementConfig.amountCents;

      await supabaseAdmin.from("user_balances").upsert({
        user_id: body.userId,
        balance_cents: newBalance,
        updated_at: now,
      });

      await supabaseAdmin.from("balance_ledger").insert({
        user_id: body.userId,
        amount_cents: achievementConfig.amountCents,
        reason: `Achievement reward: ${body.achievementKey}`,
        actor_user_id: auth.userId,
      });
    } else {
      // No active subscription → grant role directly as a time-limited subscription
      const periodEnd = new Date();
      const months = Math.round(achievementConfig.amountCents / 299); // approx months based on $2.99 unit
      periodEnd.setMonth(periodEnd.getMonth() + Math.max(1, months));

      await supabaseAdmin.from("subscriptions").insert({
        user_id: body.userId,
        plan_key: `achievement:${body.achievementKey}`,
        subscriber_role: achievementConfig.subscriberRole,
        billing_cycle: "monthly",
        status: "active",
        current_period_start: now,
        current_period_end: periodEnd.toISOString(),
        creator_code: null,
      });
    }

    // Record the achievement credit to prevent double-crediting
    await supabaseAdmin.from("achievement_credits").insert({
      user_id: body.userId,
      achievement_key: body.achievementKey,
      amount_cents: achievementConfig.amountCents,
    });

    return response({
      credited: true,
      amountCents: achievementConfig.amountCents,
      mode: activeSub ? "balance" : "role",
    });
  } catch (error) {
    logServerError("admin-achievement-reward failed", error);
    return response({ error: "Failed to grant achievement reward." }, { status: 500 });
  }
}
