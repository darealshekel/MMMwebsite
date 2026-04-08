import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  glow?: "primary" | "accent" | "none";
}

export function GlassCard({ className, glow = "none", children, ...props }: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        "glass-panel p-6",
        glow === "primary" && "glow-primary glow-border",
        glow === "accent" && "glow-accent",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
