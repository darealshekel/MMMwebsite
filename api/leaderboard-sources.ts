import { getStaticPublicSources } from "./_lib/static-mmm-leaderboard.js";
import { jsonResponse } from "./_lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const sources = getStaticPublicSources();
  return jsonResponse(
    sources,
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
      },
    },
  );
}
