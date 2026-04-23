import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { GlassCard } from "@/components/GlassCard";
import { HeroBackground } from "@/components/HeroBackground";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Copy, DatabaseZap, Gamepad2, LoaderCircle, Shield } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const authErrorMap: Record<string, string> = {
  code_expired: "Your AeTweaks login code expired. Generate a new one and enter it in the mod.",
};

type LinkCodeResponse = {
  code: string;
  browserToken: string;
  redirectTo: string;
  expiresAt: string;
};

type LinkStatusResponse =
  | { status: "pending"; redirectTo: string; expiresAt: string }
  | { status: "expired"; redirectTo: string }
  | { status: "completed"; redirectTo: string };

async function waitForAuthenticatedViewer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 12_000) {
    const response = await fetchWithTimeout("/api/me", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
      timeoutMs: 4_000,
      timeoutMessage: "Checking your new login session took too long.",
    });

    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as { authenticated?: boolean; user?: ViewerSummary | null } | null;
      if (payload?.authenticated && payload.user) {
        return payload.user;
      }
    }

    if (response.status !== 401) {
      throw new Error("AeTweaks could not verify your linked session.");
    }

    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }

  return null;
}

export default function Login() {
  const queryClient = useQueryClient();
  const { data: viewer, isLoading: isViewerLoading, error: viewerError } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error") ?? "";
  const authMessage = searchParams.get("message") ?? "";
  const authDetails = searchParams.get("details") ?? "";
  const returnTo = useMemo(() => {
    const value = searchParams.get("returnTo");
    return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
  }, [searchParams]);
  const [linkStatus, setLinkStatus] = useState<"idle" | "creating" | "waiting" | "completing">("idle");
  const [runtimeError, setRuntimeError] = useState("");
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    setRuntimeError("");
    setLinkStatus("idle");

    if (window.location.pathname === "/login") {
      window.location.replace(returnTo);
    }
  }, [queryClient, returnTo, viewer]);

  useEffect(() => {
    if (!linkCode || viewer) {
      return;
    }

    let cancelled = false;
    const poll = window.setInterval(async () => {
      try {
        const response = await fetchWithTimeout(`/api/auth/link-code/status?token=${encodeURIComponent(linkCode.browserToken)}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
          timeoutMs: 8_000,
          timeoutMessage: "Checking link status took too long.",
        });
        const payload = await response.json().catch(() => null) as ({ error?: string } & Partial<LinkStatusResponse>) | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Could not check link status.");
        }
        if (cancelled || !payload?.status) {
          return;
        }

        if (payload.status === "completed") {
          window.clearInterval(poll);
          setLinkStatus("completing");
          try {
            const authenticatedViewer = await waitForAuthenticatedViewer();
            if (!authenticatedViewer) {
              throw new Error("Your Minecraft account was linked, but the website session was not ready yet. Please try once more.");
            }

            queryClient.setQueryData(["current-user"], authenticatedViewer);
            window.location.replace(payload.redirectTo || returnTo);
            return;
          } catch (error) {
            console.error("[link-code] completion verification failed", error);
            setLinkStatus("idle");
            setLinkCode(null);
            setRuntimeError(error instanceof Error ? error.message : "AeTweaks could not finish signing you in.");
          }
        }

        if (payload.status === "expired") {
          window.clearInterval(poll);
          setLinkStatus("idle");
          setLinkCode(null);
          setRuntimeError(authErrorMap.code_expired);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("[link-code] status polling failed", error);
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [linkCode, queryClient, returnTo, viewer]);

  const errorMessage =
    runtimeError ||
    (viewerError instanceof Error ? viewerError.message : "") ||
    authMessage ||
    (errorCode ? authErrorMap[errorCode] ?? "AeTweaks could not complete sign-in. Please try again." : "");

  async function handleCreateCode() {
    try {
      setRuntimeError("");
      setLinkStatus("creating");
      const response = await fetchWithTimeout("/api/auth/link-code/create", {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeoutMs: 8_000,
        timeoutMessage: "Creating a login code took too long.",
        body: JSON.stringify({ returnTo }),
      });
      const payload = await response.json().catch(() => null) as ({ error?: string } & Partial<LinkCodeResponse>) | null;
      if (!response.ok || !payload?.code || !payload.browserToken || !payload.expiresAt || !payload.redirectTo) {
        throw new Error(payload?.error || "Could not create a login code.");
      }
      setLinkCode({
        code: payload.code,
        browserToken: payload.browserToken,
        redirectTo: payload.redirectTo,
        expiresAt: payload.expiresAt,
      });
      setLinkStatus("waiting");
    } catch (error) {
      console.error("[link-code] failed to create login code", error);
      const message = error instanceof Error ? error.message : "AeTweaks could not start the login flow.";
      setRuntimeError(message);
      setLinkStatus("idle");
    }
  }

  async function handleCopyCode() {
    if (!linkCode?.code) return;
    try {
      await navigator.clipboard.writeText(linkCode.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("[link-code] failed to copy code", error);
    }
  }

  const expiresInText = useMemo(() => {
    if (!linkCode?.expiresAt) return null;
    const seconds = Math.max(0, Math.round((new Date(linkCode.expiresAt).getTime() - Date.now()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }, [linkCode]);

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      <HeroBackground />
      <Navbar />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-4 pt-20"
      >
        <GlassCard glow="primary" className="p-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Gamepad2 className="w-5 h-5 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center mb-1">
            {viewer ? "Account Linked" : "Connect Minecraft Account"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            {viewer
              ? "Your dashboard is now bound to your linked Minecraft identity."
              : isViewerLoading
                ? "Restoring your secure sign-in state."
                : "Generate a one-time link code here, then enter it inside the AeTweaks mod to securely sign in as your Minecraft account."}
          </p>

          {!viewer && errorMessage && (
            <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-2">
                  <p>{errorMessage}</p>
                  {authDetails && (
                    <p className="break-words text-xs text-destructive/80">
                      Details: {authDetails}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="glass-panel rounded-lg p-4 mb-6 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <DatabaseZap className="w-4 h-4 text-primary" />
              Automatic mod sync is the default
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Shield className="mt-0.5 h-3.5 w-3.5 text-primary/80" />
                Players can sync mining stats, projects, sessions, and goals just by using the mod.
              </div>
              <div className="flex items-start gap-2">
                <Shield className="mt-0.5 h-3.5 w-3.5 text-primary/80" />
                Once linked, every dashboard request is filtered on the server by your Minecraft UUID.
              </div>
            </div>
          </div>

          {viewer ? (
            <div className="glass-panel rounded-lg p-4 text-center">
              <img src={viewer.avatarUrl} alt={viewer.username} className="mx-auto mb-3 h-16 w-16 rounded-2xl border border-primary/20" />
              <div className="text-base font-semibold text-foreground">{viewer.username}</div>
              <div className="mt-1 text-xs text-muted-foreground">AeTweaks mod account linked securely</div>
              <a href="/dashboard" className="mt-4 inline-flex w-full items-center justify-center">
                <Button className="w-full btn-glow bg-primary text-primary-foreground hover:bg-primary/90">
                  Open Your Dashboard
                </Button>
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {!linkCode ? (
                <Button
                  className="w-full btn-glow gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => void handleCreateCode()}
                  disabled={linkStatus !== "idle" || isViewerLoading}
                >
                  {isViewerLoading || linkStatus === "creating" ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Creating Link Code
                    </>
                  ) : (
                    <>
                      <Gamepad2 className="h-4 w-4" />
                      Generate Mod Link Code
                    </>
                  )}
                </Button>
              ) : (
                <div className="glass-panel rounded-2xl border border-primary/20 p-5 text-center space-y-4">
                  <div>
                    <div className="text-[8px] uppercase tracking-[0.08em] leading-[1.6] text-muted-foreground">Enter this in MMM</div>
                    <div className="mt-3 text-2xl tracking-[0.18em] leading-[1.5] text-primary">{linkCode.code}</div>
                  </div>
                  <Button variant="outline" className="w-full gap-2 border-border/50" onClick={() => void handleCopyCode()}>
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy Code"}
                  </Button>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>In Minecraft: open AeTweaks Features, choose Website Link, and paste this code.</p>
                    <p>{linkStatus === "completing" ? "Finalizing sign-in..." : "Waiting for your mod to claim this code."}</p>
                    {expiresInText && <p>Expires in about {expiresInText}</p>}
                  </div>
                  <Button variant="ghost" className="w-full" onClick={() => { setLinkCode(null); setLinkStatus("idle"); }}>
                    Generate a New Code
                  </Button>
                </div>
              )}
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                We only store your linked Minecraft UUID, current username, and a local AeTweaks website account id.
              </p>
            </div>
          )}

          <div className="neon-line my-6" />
          <p className="text-sm text-muted-foreground text-center">
            Authentication is completed by the AeTweaks mod using the Minecraft account you are already playing on.
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
