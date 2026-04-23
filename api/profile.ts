import { jsonResponse, rateLimitRequest, supabaseAdmin } from "./_lib/server.js";
import { DEFAULT_SETTINGS, getAuthContext, requireCsrf } from "./_lib/session.js";

export const config = { runtime: "edge" };

type ProfilePatch = Partial<{
  publicProfile: boolean;
  leaderboardOptIn: boolean;
  sessionSharing: boolean;
  hudEnabled: boolean;
  hudAlignment: string;
  hudScale: number;
}>;

export function sanitizePatch(input: unknown): ProfilePatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const source = input as Record<string, unknown>;
  const patch: ProfilePatch = {};

  for (const key of ["publicProfile", "leaderboardOptIn", "sessionSharing", "hudEnabled"] as const) {
    if (typeof source[key] === "boolean") {
      patch[key] = source[key] as boolean;
    }
  }

  if (typeof source.hudAlignment === "string" && source.hudAlignment.length <= 24) {
    patch.hudAlignment = source.hudAlignment;
  }

  if (typeof source.hudScale === "number" && Number.isFinite(source.hudScale)) {
    patch.hudScale = Math.max(0.5, Math.min(3, source.hudScale));
  }

  return patch;
}

export default async function handler(request: Request) {
  const allowed = await rateLimitRequest(request, "profile", request.method.toLowerCase(), 60, 5 * 60 * 1000);
  if (!allowed) return jsonResponse({ error: "Too many requests." }, { status: 429 });

  const auth = await getAuthContext(request);
  if (!auth) return jsonResponse({ error: "Authentication required." }, { status: 401 });

  if (request.method === "GET") {
    return jsonResponse({
      user: {
        userId: auth.userId,
        username: auth.viewer.minecraftUsername,
        avatarUrl: auth.viewer.avatarUrl,
        provider: auth.viewer.provider,
      },
    });
  }

  if (request.method !== "PATCH") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  if (!(await requireCsrf(request, auth))) {
    return jsonResponse({ error: "CSRF validation failed." }, { status: 403 });
  }

  const patch = sanitizePatch(await request.json().catch(() => null));
  const playerRows = await supabaseAdmin.from("players").select("id").eq("minecraft_uuid_hash", auth.viewer.minecraftUuidHash);
  if (playerRows.error) throw playerRows.error;

  const playerIds = (playerRows.data ?? []).map((row) => row.id as string);
  const settingsPayload = {
    publicProfile: patch.publicProfile ?? DEFAULT_SETTINGS.publicProfile,
    leaderboardOptIn: patch.leaderboardOptIn ?? DEFAULT_SETTINGS.leaderboardOptIn,
    sessionSharing: patch.sessionSharing ?? DEFAULT_SETTINGS.sessionSharing,
    autoSyncMiningData: DEFAULT_SETTINGS.autoSyncMiningData,
    crossServerAggregation: DEFAULT_SETTINGS.crossServerAggregation,
    realTimeHudSync: DEFAULT_SETTINGS.realTimeHudSync,
  };

  await supabaseAdmin
    .from("users")
    .update({
      profile_preferences: settingsPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.userId);

  if (playerIds.length > 0) {
    const rows = playerIds.map((playerId) => ({
      player_id: playerId,
      hud_enabled: patch.hudEnabled ?? DEFAULT_SETTINGS.hudEnabled,
      hud_alignment: patch.hudAlignment ?? DEFAULT_SETTINGS.hudAlignment,
      hud_scale: patch.hudScale ?? DEFAULT_SETTINGS.hudScale,
      json_settings: settingsPayload,
      updated_at: new Date().toISOString(),
    }));
    const result = await supabaseAdmin.from("user_settings").upsert(rows, { onConflict: "player_id" });
    if (result.error) throw result.error;
  }

  return jsonResponse({ ok: true });
}
