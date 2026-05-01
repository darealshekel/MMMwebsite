import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle, Loader2 } from "lucide-react";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { Footer } from "@/components/Footer";

export default function SubscriptionSuccess() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "pending">("loading");
  const planKey = searchParams.get("planKey") ?? "";

  useEffect(() => {
    const timer = setTimeout(() => {
      // PayPal webhooks activate the subscription asynchronously.
      // The success page just confirms the redirect happened.
      setStatus("success");
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const tierLabel = planKey.startsWith("supporter_plus")
    ? "Supporter Plus"
    : planKey.startsWith("supporter")
      ? "Supporter"
      : "Subscription";

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />
      <main className="container py-20 text-center space-y-6">
        {status === "loading" ? (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        ) : (
          <>
            <CheckCircle className="mx-auto h-14 w-14 text-primary" />
            <div className="space-y-2">
              <h1 className="font-pixel text-3xl text-foreground">
                Welcome, {tierLabel}
                <span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-pixel text-[10px] text-muted-foreground max-w-md mx-auto leading-[2]">
                Your subscription is being activated. It may take a few minutes to appear on your profile.
                Check your Discord for confirmation once it&apos;s live.
              </p>
            </div>
            <div className="flex justify-center gap-3 flex-wrap pt-2">
              <Link
                to="/leaderboard"
                className="btn-glow border border-primary/40 bg-primary/10 px-5 py-2.5 font-pixel text-[9px] text-primary hover:bg-primary/20"
              >
                LEADERBOARD
              </Link>
              <Link
                to="/mod"
                className="border border-border/60 px-5 py-2.5 font-pixel text-[9px] text-muted-foreground hover:border-border hover:text-foreground"
              >
                BACK TO MOD PAGE
              </Link>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
