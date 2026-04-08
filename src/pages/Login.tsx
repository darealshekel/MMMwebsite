import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { GlassCard } from "@/components/GlassCard";
import { HeroBackground } from "@/components/HeroBackground";
import { Button } from "@/components/ui/button";
import { AlertCircle, Pickaxe, Shield, DatabaseZap, ArrowRight, LockKeyhole } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

const authErrorMap: Record<string, string> = {
  auth_config: "Microsoft login is not configured on the website yet. Add the Microsoft auth environment variables in Vercel to enable account linking.",
  missing_oauth_state: "Your login session expired before Microsoft returned. Please try signing in again.",
  invalid_oauth_state: "The Microsoft login state check failed. Please try again from the login page.",
  missing_code: "Microsoft did not return a valid authorization code. Please try again.",
  link_failed: "Microsoft sign-in completed, but account linking failed on the backend. Check the server auth environment and Supabase auth tables.",
};

export default function Login() {
  const { data: viewer } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const microsoftLoginUrl = `/api/auth/microsoft/start?returnTo=${encodeURIComponent("/dashboard")}`;
  const errorCode = searchParams.get("error") ?? "";
  const errorMessage = errorCode ? authErrorMap[errorCode] ?? "Microsoft sign-in could not be completed. Please try again." : "";

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
              : "Sign in through Microsoft's official login page. Your password never touches AeTweaks."}
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
              <a href={microsoftLoginUrl} className="block">
                <Button className="w-full btn-glow gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                  <LockKeyhole className="h-4 w-4" />
                  Sign in with Microsoft
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                We only store your linked Minecraft UUID, current username, and a local website account id.
              </p>
            </div>
          )}

          <div className="neon-line my-6" />
          <p className="text-sm text-muted-foreground text-center">
            Authentication happens on Microsoft’s website, not inside AeTweaks.
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
