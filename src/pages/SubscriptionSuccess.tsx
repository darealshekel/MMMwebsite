import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { Footer } from "@/components/Footer";

function getCsrfToken() {
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("aetweaks_csrf="))
    ?.split("=")[1] ?? null;
}

export default function SubscriptionSuccess() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const didCapture = useRef(false);

  const planKey = searchParams.get("planKey") ?? "";
  const orderId = searchParams.get("token") ?? "";

  const tierLabel = planKey.startsWith("supporter_plus")
    ? "Supporter Plus"
    : planKey.startsWith("supporter")
      ? "Supporter"
      : "Subscription";

  useEffect(() => {
    if (!orderId || didCapture.current) return;
    didCapture.current = true;

    const csrf = getCsrfToken();
    if (!csrf) {
      setErrorMsg("Session not found. Please log in and try again.");
      setStatus("error");
      return;
    }

    fetch("/api/paypal/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ orderId }),
    })
      .then((res) => res.json())
      .then((data: { success?: boolean; error?: string }) => {
        if (data.success) {
          setStatus("success");
        } else {
          setErrorMsg(data.error ?? "Payment capture failed.");
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMsg("Network error. Please contact support.");
        setStatus("error");
      });
  }, [orderId]);

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />
      <main className="container py-20 text-center space-y-6">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <p className="font-pixel text-[10px] text-muted-foreground">Activating your subscription…</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="mx-auto h-14 w-14 text-primary" />
            <div className="space-y-2">
              <h1 className="font-pixel text-3xl text-foreground">
                Welcome, {tierLabel}
                <span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-pixel text-[10px] text-muted-foreground max-w-md mx-auto leading-[2]">
                Your subscription is now active. Your coloured username will appear across the site shortly.
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

        {status === "error" && (
          <>
            <AlertCircle className="mx-auto h-14 w-14 text-red-400" />
            <div className="space-y-2">
              <h1 className="font-pixel text-2xl text-foreground">Something went wrong</h1>
              <p className="font-pixel text-[9px] text-red-400 max-w-md mx-auto leading-[2]">{errorMsg}</p>
              <p className="font-pixel text-[9px] text-muted-foreground max-w-md mx-auto leading-[2]">
                If your payment went through, contact us on Discord and we will activate your subscription manually.
              </p>
            </div>
            <div className="flex justify-center gap-3 flex-wrap pt-2">
              <Link
                to="/mod"
                className="btn-glow border border-primary/40 bg-primary/10 px-5 py-2.5 font-pixel text-[9px] text-primary hover:bg-primary/20"
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
