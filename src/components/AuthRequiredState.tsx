import { motion } from "framer-motion";
import { LockKeyhole } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";

export function AuthRequiredState({
  title = "You're not logged in",
  subtitle = "Log in to view your dashboard and stats.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-[28rem] items-center justify-center"
    >
      <GlassCard glow="primary" className="w-full max-w-xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center border border-primary/30 bg-primary/10">
          <LockKeyhole className="h-7 w-7 text-primary" />
        </div>
        <h2 className="font-pixel text-xl text-foreground">{title}</h2>
        <p className="mx-auto mt-3 max-w-md text-[10px] leading-[1.8] text-muted-foreground">
          {subtitle}
        </p>
        <a href="/login" className="mt-6 inline-flex">
          <Button className="btn-glow bg-primary px-5 text-primary-foreground hover:bg-primary/90">
            Log In
          </Button>
        </a>
      </GlassCard>
    </motion.div>
  );
}
