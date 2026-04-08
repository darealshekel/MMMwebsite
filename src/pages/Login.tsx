import { useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { GlassCard } from "@/components/GlassCard";
import { HeroBackground } from "@/components/HeroBackground";
import { Button } from "@/components/ui/button";
import { Pickaxe, Mail, Lock, Eye, EyeOff, User, Shield, DatabaseZap } from "lucide-react";

export default function Login() {
  const [isSignup, setIsSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
            {isSignup ? "Optional Account Linking" : "Dashboard Access"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            {isSignup ? "AeTweaks can sync without login. Accounts are optional for future private dashboards and community features." : "Use an optional account for expanded dashboard controls. Core AeTweaks sync can still work without sign-in."}
          </p>

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
                This screen is optional and kept here for future account-based features.
              </div>
            </div>
          </div>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            {isSignup && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Username"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 text-sm"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                placeholder="Email"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 text-sm"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button type="submit" className="w-full btn-glow bg-primary text-primary-foreground hover:bg-primary/90">
              {isSignup ? "Create Optional Account" : "Sign In"}
            </Button>
          </form>

          <div className="neon-line my-6" />

          <p className="text-sm text-muted-foreground text-center">
            {isSignup ? "Already have an account?" : "Need the optional account flow?"}{" "}
            <button onClick={() => setIsSignup(!isSignup)} className="text-primary hover:underline font-medium">
              {isSignup ? "Sign In" : "Create One"}
            </button>
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
