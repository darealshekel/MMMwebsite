import { getStaticPublicSources } from "./_lib/static-mmm-leaderboard.js";
import { applyStaticManualOverridesToSources } from "./_lib/static-mmm-overrides.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const sources = await applyStaticManualOverridesToSources(getStaticPublicSources());
  return jsonResponse(
    sources,
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
