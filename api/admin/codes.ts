import { getAuthContext, requireCsrf } from "../_lib/session.js";
import { jsonResponse, logServerError, supabaseAdmin } from "../_lib/server.js";
import { isOwnerRole } from "../../shared/admin-management.js";

export const config = { runtime: "edge" };

function response(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return jsonResponse(body, { ...init, headers });
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export default async function handler(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return response({ error: "Authentication required." }, { status: 401 });
    if (!isOwnerRole(auth.viewer.role)) return response({ error: "Owner access required." }, { status: 403 });

    const url = new URL(request.url);

    // GET: list codes
    if (request.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("creator_codes")
        .select("id,code,owner_username,discount_percent,is_active,uses_count,created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return response({ codes: data ?? [] });
    }

    if (!(await requireCsrf(request, auth))) {
      return response({ error: "CSRF validation failed." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    // POST: create
    if (request.method === "POST") {
      const code = normalizeCode(String(body?.code ?? ""));
      const discountPercent = Math.round(Number(body?.discountPercent ?? 10));
      const ownerUsername = String(body?.ownerUsername ?? "").trim() || null;

      if (!code || code.length < 2 || code.length > 32) {
        return response({ error: "Code must be 2–32 alphanumeric characters." }, { status: 400 });
      }
      if (discountPercent < 1 || discountPercent > 100) {
        return response({ error: "Discount must be between 1 and 100." }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from("creator_codes")
        .insert({ code, owner_username: ownerUsername, discount_percent: discountPercent })
        .select("id,code,owner_username,discount_percent,is_active,uses_count")
        .single();

      if (error) {
        if (error.code === "23505") {
          return response({ error: "Code already exists." }, { status: 409 });
        }
        throw error;
      }
      return response({ code: data });
    }

    // PATCH: update
    if (request.method === "PATCH") {
      const id = String(body?.id ?? "").trim();
      if (!id) return response({ error: "id is required." }, { status: 400 });

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body?.isActive === "boolean") updates.is_active = body.isActive;
      if (body?.discountPercent !== undefined) {
        const dp = Math.round(Number(body.discountPercent));
        if (dp < 1 || dp > 100) return response({ error: "Discount must be 1–100." }, { status: 400 });
        updates.discount_percent = dp;
      }
      if (body?.ownerUsername !== undefined) {
        updates.owner_username = String(body.ownerUsername).trim() || null;
      }

      const { data, error } = await supabaseAdmin
        .from("creator_codes")
        .update(updates)
        .eq("id", id)
        .select("id,code,owner_username,discount_percent,is_active,uses_count")
        .maybeSingle();

      if (error) throw error;
      if (!data) return response({ error: "Code not found." }, { status: 404 });
      return response({ code: data });
    }

    // DELETE
    if (request.method === "DELETE") {
      const id = String(body?.id ?? "").trim();
      if (!id) return response({ error: "id is required." }, { status: 400 });

      const { error } = await supabaseAdmin.from("creator_codes").delete().eq("id", id);
      if (error) throw error;
      return response({ deleted: true });
    }

    return response({ error: "Method not allowed." }, { status: 405 });
  } catch (error) {
    logServerError("admin-codes failed", error);
    return response({ error: "Failed to manage codes." }, { status: 500 });
  }
}
