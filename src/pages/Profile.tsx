import { motion } from "framer-motion";
import { User, Trophy, Pickaxe, Calendar, Globe, Shield } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { ProgressRing } from "@/components/ProgressRing";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { useAeTweaksSnapshot } from "@/hooks/use-aetweaks-snapshot";

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Profile() {
  const { data, isLoading } = useAeTweaksSnapshot();
  const requiresAuth = data?.meta.source === "auth_required";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="mx-auto max-w-4xl">
          {data && <div className="mb-6"><SyncStatusBanner meta={data.meta} compact /></div>}

          {isLoading && (
            <GlassCard className="mb-6 p-4">
              <p className="text-sm text-muted-foreground">Loading player profile...</p>
            </GlassCard>
          )}

          {!!data && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {requiresAuth && (
                <GlassCard className="mb-6 p-5">
                  <p className="text-sm text-muted-foreground">Sign in to view the profile for your linked Minecraft identity only.</p>
                </GlassCard>
              )}
              <GlassCard glow="primary" className="mb-6 p-8">
                <div className="flex flex-col items-center gap-6 sm:flex-row">
                  {data.viewer ? (
                    <img src={data.viewer.avatarUrl} alt={data.viewer.username} className="h-20 w-20 rounded-2xl border border-primary/30 bg-primary/10" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
                      <User className="h-10 w-10 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 text-center sm:text-left">
                    <h1 className="text-2xl font-bold text-foreground">{data.viewer?.username ?? data.player?.username ?? "Awaiting first player sync"}</h1>
                    <p className="text-sm text-muted-foreground">
                      {data.viewer ? `Linked via ${data.viewer.provider} • ${data.player?.lastModVersion ?? "Mod version unknown"}` : data.player ? `${data.player.trustLevel} sync identity • ${data.player.lastModVersion ?? "Mod version unknown"}` : "Supabase connected, waiting for AeTweaks sync"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" /> First seen {formatDate(data.player?.firstSeenAt)}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3" /> {data.worlds.length} synced worlds
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Shield className="h-3 w-3" /> UUID-linked account protection
                      </div>
                    </div>
                  </div>
                  <ProgressRing progress={Math.min(100, Math.round((data.player?.totalSyncedBlocks ?? 0) / 5000))} size={80} label="Sync Level" />
                </div>
              </GlassCard>

              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Total Blocks", value: (data.player?.totalSyncedBlocks ?? 0).toLocaleString(), icon: Pickaxe },
                  { label: "Aeternum Total Digs", value: data.player?.aeternumTotalDigs != null ? data.player.aeternumTotalDigs.toLocaleString() : "—", icon: Trophy },
                  { label: "Leaderboard Rank", value: data.leaderboard?.rankCached ? `#${data.leaderboard.rankCached}` : "—", icon: Trophy },
                  { label: "Projects Synced", value: String(data.projects.length), icon: Calendar },
                ].map((stat) => (
                  <GlassCard key={stat.label} className="p-4 text-center">
                    <stat.icon className="mx-auto mb-2 h-5 w-5 text-primary" />
                    <div className="text-xl font-bold text-foreground">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </GlassCard>
                ))}
              </div>

              <GlassCard className="p-5">
                <h3 className="mb-4 font-semibold text-foreground">Synced Worlds & Servers</h3>
                <div className="space-y-3">
                  {data.worlds.length === 0 && <div className="text-sm text-muted-foreground">No world or server stats have synced yet.</div>}
                  {data.worlds.map((world) => (
                    <div key={world.id} className="flex items-center justify-between border-b border-border/30 py-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-glow-emerald" />
                        <div>
                          <span className="text-sm text-foreground">{world.displayName}</span>
                          <p className="text-xs text-muted-foreground">{world.kind}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{world.totalBlocks.toLocaleString()} blocks</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}
        </div>
      </DashboardLayout>
    </div>
  );
}
