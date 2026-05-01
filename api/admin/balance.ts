import { getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError, supabaseAdmin } from "../_lib/server.js";
import { isOwnerRole } from "../../shared/admin-management.js";

export const config = { runtime: "edge" };

function response(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return jsonResponse(body, { ...init, headers });
}

export default async function handler(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return response({ error: "Authentication required." }, { status: 401 });
    if (!isOwnerRole(auth.viewer.role)) return response({ error: "Owner access required." }, { status: 403 });

    const url = new URL(request.url);

    // GET: fetch balance and ledger for a user
    if (request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId?.trim()) return response({ error: "userId is required." }, { status: 400 });

      const [balanceResult, ledgerResult] = await Promise.all([
        supabaseAdmin
          .from("user_balances")
          .select("balance_cents,updated_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("balance_ledger")
          .select("id,amount_cents,reason,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      return response({
        balanceCents: (balanceResult.data as { balance_cents: number } | null)?.balance_cents ?? 0,
        ledger: ledgerResult.data ?? [],
      });
    }

    // POST: add or set balance
    if (request.method === "POST") {
      if (!(await requireCsrf(request, auth))) {
        return response({ error: "CSRF validation failed." }, { status: 403 });
      }

      const body = (await request.json().catch(() => null)) as {
        userId?: string;
        amountCents?: number;
        reason?: string;
        mode?: "add" | "subtract" | "set";
      } | null;

      if (!body?.userId || typeof body.amountCents !== "number" || !body.reason) {
        return response({ error: "userId, amountCents, and reason are required." }, { status: 400 });
      }

      const mode = body.mode ?? "add";
      const userId = body.userId;
      const amountCents = Math.round(body.amountCents);

      // Get current balance
      const { data: existing } = await supabaseAdmin
        .from("user_balances")
        .select("balance_cents")
        .eq("user_id", userId)
        .maybeSingle();

      const currentBalance = (existing as { balance_cents: number } | null)?.balance_cents ?? 0;

      let newBalance: number;
      let ledgerAmount: number;

      if (mode === "set") {
        newBalance = Math.max(0, amountCents);
        ledgerAmount = newBalance - currentBalance;
      } else if (mode === "subtract") {
        newBalance = Math.max(0, currentBalance - Math.abs(amountCents));
        ledgerAmount = newBalance - currentBalance;
      } else {
        newBalance = currentBalance + Math.abs(amountCents);
        ledgerAmount = Math.abs(amountCents);
      }

      await supabaseAdmin.from("user_balances").upsert({
        user_id: userId,
        balance_cents: newBalance,
        updated_at: new Date().toISOString(),
      });

      await supabaseAdmin.from("balance_ledger").insert({
        user_id: userId,
        amount_cents: ledgerAmount,
        reason: body.reason,
        actor_user_id: auth.userId,
      });

      return response({ balanceCents: newBalance });
    }

    return response({ error: "Method not allowed." }, { status: 405 });
  } catch (error) {
    logServerError("admin-balance failed", error);
    return response({ error: "Failed to manage balance." }, { status: 500 });
  }
}
