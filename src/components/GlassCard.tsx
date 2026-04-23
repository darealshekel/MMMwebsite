import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  glow?: "primary" | "accent" | "none";
}

export function GlassCard({ className, glow = "none", children, ...props }: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        "pixel-card p-5",
        glow === "primary" && "border-primary/30",
        glow === "accent" && "border-white/12",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
