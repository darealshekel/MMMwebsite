import { AlertCircle, CheckCircle2, DatabaseZap, Sparkles } from "lucide-react";
import type { SyncMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

const iconMap = {
  live: CheckCircle2,
  demo: Sparkles,
  empty: DatabaseZap,
  error: AlertCircle,
} as const;

const toneMap = {
  live: "border-primary/30 bg-primary/10 text-primary",
  demo: "border-accent/30 bg-accent/10 text-accent",
  empty: "border-border/60 bg-secondary/50 text-foreground",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

export function SyncStatusBanner({ meta, compact = false }: { meta: SyncMeta; compact?: boolean }) {
  const Icon = iconMap[meta.source];

  return (
    <div className={cn("glass-panel rounded-2xl border px-4 py-3", toneMap[meta.source], compact && "px-3 py-2")}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", compact && "mt-0 h-3.5 w-3.5")} />
        <div className="space-y-0.5">
          <p className={cn("text-sm font-semibold", compact && "text-xs")}>{meta.title}</p>
          <p className={cn("text-xs leading-relaxed text-foreground/80", compact && "text-[11px]")}>{meta.description}</p>
        </div>
      </div>
    </div>
  );
}
