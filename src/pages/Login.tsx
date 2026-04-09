import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { GlassCard } from "@/components/GlassCard";
import { HeroBackground } from "@/components/HeroBackground";
import { Button } from "@/components/ui/button";
import { AlertCircle, Pickaxe, Shield, DatabaseZap, ArrowRight, LockKeyhole, LoaderCircle } from "lucide-react";
import {
  clearPendingLoginState,
  exchangeSupabaseCodeForSessionIfPresent,
  finalizeMinecraftAccountLink,
  getPendingLoginReturnTo,
  getSupabaseBrowserSession,
  startMicrosoftSignIn,
} from "@/lib/browser-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useCurrentUser } from "@/hooks/use-current-user";

const authErrorMap: Record<string, string> = {
  auth_config: "Microsoft login is not configured in Supabase Auth yet. Enable the Microsoft provider there and add your Azure client credentials.",
  oauth_exchange_failed: "Supabase could not finish the Microsoft sign-in callback. Please try again.",
  missing_provider_token: "Supabase signed you in, but did not return a Microsoft provider token for Minecraft account linking.",
  link_failed: "Microsoft sign-in completed, but AeTweaks could not link your Minecraft account on the backend.",
};
const CALLBACK_TIMEOUT_MS = 20_000;

export default function Login() {
  const { data: viewer, isLoading: isViewerLoading, error: viewerError } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error") ?? "";
  const hasOAuthArtifacts = Boolean(searchParams.get("code") || searchParams.get("state") || errorCode);
  const returnTo = useMemo(() => {
    const value = searchParams.get("returnTo");
    return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
  }, [searchParams]);
  const [linkStatus, setLinkStatus] = useState<"idle" | "redirecting" | "linking">("idle");
  const [runtimeError, setRuntimeError] = useState("");
  const processedCodeRef = useRef<string | null>(null);
  const linkedSessionRef = useRef(false);
  const callbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      console.info("[auth] Supabase auth state changed", { event, hasSession: Boolean(session), hasProviderToken: Boolean(session?.provider_token) });
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        void queryClient.invalidateQueries({ queryKey: ["current-user"] });
      }
      if ((event === "SIGNED_OUT" || !session) && linkStatus === "linking") {
        setLinkStatus("idle");
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [linkStatus, queryClient]);

  useEffect(() => {
    const pendingReturnTo = getPendingLoginReturnTo();

    if (!hasOAuthArtifacts || pendingReturnTo) {
      return;
    }

    setRuntimeError("");
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
  }, [hasOAuthArtifacts, navigate, returnTo]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    clearPendingLoginState();
    setRuntimeError("");
    setLinkStatus("idle");

    if (window.location.pathname === "/login") {
      console.info("[auth] viewer restored, redirecting away from login", { returnTo });
      navigate(returnTo, { replace: true });
    }
  }, [navigate, returnTo, viewer]);

  useEffect(() => {
    if (linkStatus !== "linking") {
      if (callbackTimeoutRef.current) {
        window.clearTimeout(callbackTimeoutRef.current);
        callbackTimeoutRef.current = null;
      }
      return;
    }

    callbackTimeoutRef.current = window.setTimeout(() => {
      console.error("[auth] callback timeout reached");
      clearPendingLoginState();
      setLinkStatus("idle");
      setRuntimeError("Microsoft sign-in took too long to finish. Please try again.");
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
    }, CALLBACK_TIMEOUT_MS);

    return () => {
      if (callbackTimeoutRef.current) {
        window.clearTimeout(callbackTimeoutRef.current);
        callbackTimeoutRef.current = null;
      }
    };
  }, [linkStatus, navigate, returnTo]);

  useEffect(() => {
    let cancelled = false;

    async function finishSupabaseCallback() {
      if (viewer) return;

      const code = searchParams.get("code");
      const pendingReturnTo = getPendingLoginReturnTo();
      if (code) {
        if (!pendingReturnTo) {
          console.warn("[auth] ignoring callback because no fresh login is pending");
          navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
          return;
        }
        if (processedCodeRef.current === code) {
          console.info("[auth] callback code already processed, skipping duplicate");
          return;
        }
        processedCodeRef.current = code;
      }

      if (!code) {
        if (!pendingReturnTo) {
          return;
        }
        if (linkedSessionRef.current) {
          return;
        }
        const session = await getSupabaseBrowserSession().catch(() => null);
        if (!session?.provider_token) {
          console.info("[auth] no provider token present yet, waiting for a fresh callback");
          return;
        }
        linkedSessionRef.current = true;
      }

      setLinkStatus("linking");
      setRuntimeError("");

      try {
        await exchangeSupabaseCodeForSessionIfPresent(code);
        const result = await finalizeMinecraftAccountLink(returnTo);
        if (cancelled) return;
        linkedSessionRef.current = true;
        clearPendingLoginState();
        await queryClient.invalidateQueries({ queryKey: ["current-user"] });
        await queryClient.invalidateQueries({ queryKey: ["aetweaks-snapshot"] });
        console.info("[auth] login flow complete, navigating", { redirectTo: result.redirectTo || returnTo });
        navigate(result.redirectTo || returnTo, { replace: true });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Microsoft sign-in could not be completed. Please try again.";
        console.error("[auth] login flow failed", error);
        setRuntimeError(message);
        setLinkStatus("idle");
        clearPendingLoginState();
        navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
        if (!code) {
          linkedSessionRef.current = false;
        }
      }
    }

    void finishSupabaseCallback();

    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient, returnTo, searchParams, viewer]);

  const errorMessage =
    runtimeError ||
    (viewerError instanceof Error ? viewerError.message : "") ||
    (errorCode ? authErrorMap[errorCode] ?? "Microsoft sign-in could not be completed. Please try again." : "");

  async function handleMicrosoftLogin() {
    try {
      setRuntimeError("");
      setLinkStatus("redirecting");
      await startMicrosoftSignIn(returnTo);
    } catch (error) {
      console.error("[auth] failed to start Microsoft sign-in", error);
      const message = error instanceof Error ? error.message : "Microsoft sign-in could not be started.";
      setRuntimeError(message);
      setLinkStatus("idle");
    }
  }

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center">
      <Navbar />
      <HeroBackground />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-4 pt-20"
      >
        <GlassCard glow="primary" className="p-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Pickaxe className="w-5 h-5 text-primary" />
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
                : "Sign in through Supabase Auth using Microsoft's official login page. Your password never touches AeTweaks."}
          </p>

          {!viewer && errorMessage && (
            <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{errorMessage}</p>
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
              <div className="mt-1 text-xs text-muted-foreground">Microsoft account linked securely</div>
              <a href="/dashboard" className="mt-4 inline-flex w-full items-center justify-center">
                <Button className="w-full btn-glow bg-primary text-primary-foreground hover:bg-primary/90">
                  Open Your Dashboard
                </Button>
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                className="w-full btn-glow gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => void handleMicrosoftLogin()}
                disabled={linkStatus !== "idle" || isViewerLoading}
              >
                {isViewerLoading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Restoring Session
                  </>
                ) : linkStatus === "linking" ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Linking Minecraft Account
                  </>
                ) : linkStatus === "redirecting" ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Redirecting to Microsoft
                  </>
                ) : (
                  <>
                  <LockKeyhole className="h-4 w-4" />
                  Sign in with Microsoft
                  <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
              {hasOAuthArtifacts && linkStatus !== "idle" && (
                <p className="text-center text-xs text-muted-foreground">
                  Finalizing your Microsoft sign-in and restoring your AeTweaks session.
                </p>
              )}
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                We only store your linked Minecraft UUID, current username, and a local AeTweaks website account id.
              </p>
            </div>
          )}

          <div className="neon-line my-6" />
          <p className="text-sm text-muted-foreground text-center">
            Authentication happens on Microsoft’s website through Supabase Auth, not inside AeTweaks.
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
