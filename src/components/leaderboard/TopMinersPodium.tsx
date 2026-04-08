import { motion } from "framer-motion";
import { Crown, Medal, Trophy } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { PlayerSkinModel } from "@/components/leaderboard/PlayerSkinModel";
import type { LeaderboardRowSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const podiumConfig = [
  {
    slot: 2,
    accent: "from-slate-300/30 via-slate-200/10 to-transparent",
    icon: Medal,
    glow: "shadow-[0_24px_60px_rgba(148,163,184,0.22)]",
    border: "border-slate-200/15",
    modelSize: 160,
    cardClass: "md:translate-y-8",
    label: "Silver",
  },
  {
    slot: 1,
    accent: "from-amber-300/35 via-primary/20 to-transparent",
    icon: Crown,
    glow: "shadow-[0_28px_72px_rgba(250,204,21,0.24)]",
    border: "border-amber-300/20",
    modelSize: 190,
    cardClass: "md:-translate-y-3",
    label: "Gold",
  },
  {
    slot: 3,
    accent: "from-orange-400/30 via-orange-200/10 to-transparent",
    icon: Trophy,
    glow: "shadow-[0_24px_60px_rgba(251,146,60,0.2)]",
    border: "border-orange-300/15",
    modelSize: 160,
    cardClass: "md:translate-y-10",
    label: "Bronze",
  },
] as const;

function formatBlocks(value: number) {
  return `${value.toLocaleString()} digs`;
}

export function TopMinersPodium({ rows }: { rows: LeaderboardRowSummary[] }) {
  const podiumRows = [rows[1], rows[0], rows[2]];

  return (
    <div className="grid gap-4 md:grid-cols-3 md:items-end">
      {podiumConfig.map((config, index) => {
        const row = podiumRows[index];
        const Icon = config.icon;

        return (
          <motion.div
            key={config.slot}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className={config.cardClass}
          >
            <GlassCard
              className={cn(
                "relative overflow-hidden rounded-[28px] border bg-card/70 p-5 backdrop-blur-2xl",
                config.glow,
                config.border,
              )}
            >
              <div className={cn("absolute inset-0 bg-gradient-to-b opacity-90", config.accent)} />
              <div className="absolute inset-x-6 top-0 h-px bg-white/20" />
              <div className="absolute inset-x-8 top-16 h-28 rounded-full bg-white/10 blur-3xl" />
              <div className="relative flex flex-col items-center text-center">
                <div className="mb-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </div>
                {row ? (
                  <>
                    <PlayerSkinModel
                      username={row.username}
                      size={config.modelSize}
                      className="mb-4 w-full max-w-[220px]"
                      canvasClassName="aspect-square"
                    />
                    <div className="mb-1 text-xs uppercase tracking-[0.3em] text-white/45">#{row.rank}</div>
                    <div className="max-w-[12rem] truncate text-xl font-semibold text-foreground">{row.username}</div>
                    <div className="mt-2 text-sm font-medium text-white/75">{formatBlocks(row.blocksMined)}</div>
                    <div className="mt-4 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-muted-foreground">
                      Synced from {row.sourceServer}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-52 items-center text-sm text-muted-foreground">Waiting for synced miners</div>
                )}
              </div>
            </GlassCard>
          </motion.div>
        );
      })}
    </div>
  );
}
