const trim = (value: string | undefined) => value?.trim() ?? "";

export const appEnv = {
  supabaseUrl: trim(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: trim(import.meta.env.VITE_SUPABASE_ANON_KEY),
  defaultPlayerUsername: trim(import.meta.env.VITE_DEFAULT_PLAYER_USERNAME),
  defaultClientId: trim(import.meta.env.VITE_DEFAULT_CLIENT_ID),
};

export const hasSupabaseEnv = Boolean(appEnv.supabaseUrl && appEnv.supabaseAnonKey);
