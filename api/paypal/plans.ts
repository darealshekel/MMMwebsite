import { jsonResponse, serverEnv } from "../_lib/server.js";

export const config = { runtime: "edge" };

export default function handler() {
  return jsonResponse(
    {
      clientId: serverEnv.paypalClientId,
      plans: {
        supporter_monthly:      serverEnv.paypalPlanSupporterMonthly,
        supporter_yearly:       serverEnv.paypalPlanSupporterYearly,
        supporter_plus_monthly: serverEnv.paypalPlanSupporterPlusMonthly,
        supporter_plus_yearly:  serverEnv.paypalPlanSupporterPlusYearly,
      },
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
