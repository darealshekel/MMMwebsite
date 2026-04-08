import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appEnv, hasSupabaseEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (!hasSupabaseEnv) {
    throw new Error("Supabase browser auth is not configured.");
  }

  if (!client) {
    client = createClient(appEnv.supabaseUrl, appEnv.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }

  return client;
}
