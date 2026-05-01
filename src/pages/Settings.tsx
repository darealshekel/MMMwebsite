import { motion } from "framer-motion";
import { Cloud, Shield, Globe, Database } from "lucide-react";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { SkeletonCard } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { useMMMSnapshot } from "@/hooks/use-mmm-snapshot";

function ToggleRow({ label, desc, enabled }: { label: string; desc: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <div className={`flex h-6 w-10 items-center rounded-full px-1 transition-colors ${enabled ? "bg-primary" : "bg-secondary"}`}>
        <div className={`h-4 w-4 rounded-full transition-transform ${enabled ? "translate-x-4 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"}`} />
      </div>
    </div>
  );
}

export default function Settings() {
  const { data, isLoading } = useMMMSnapshot();
  const requiresAuth = data?.meta.source === "auth_required";

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />
      <DashboardLayout>
        <div className="mx-auto max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Settings & Sync</h1>
              <p className="text-sm text-muted-foreground">Inspect sync state, privacy preferences, and dashboard-ready MMM settings.</p>
            </div>
            {data && <SyncStatusBanner meta={data.meta} compact />}
          </motion.div>

          {isLoading && (
            <SkeletonCard className="mb-6" lines={4} />
          )}

          {!!data && (
            <>
              {requiresAuth && (
                <GlassCard className="mb-6 p-5">
                  <p className="text-sm text-muted-foreground">Sign in to manage privacy and sync settings for your linked account.</p>
                </GlassCard>
              )}
              <GlassCard className="mb-6 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Sync Settings</h3>
                </div>
                <div className="space-y-4">
                  <ToggleRow label="Auto-Sync Mining Data" desc="Automatically upload session data as the mod keeps playing." enabled={data.settings.autoSyncMiningData} />
                  <ToggleRow label="Cross-Server Aggregation" desc="Merge stats from multiple worlds and servers into one profile view." enabled={data.settings.crossServerAggregation} />
                  <ToggleRow label="Real-Time HUD Sync" desc="Push in-session HUD changes to the online dashboard." enabled={data.settings.realTimeHudSync} />
                  <ToggleRow label="Leaderboard Opt-In" desc="Allow synced totals to appear in public leaderboard views." enabled={data.settings.leaderboardOptIn} />
                </div>
              </GlassCard>

              <GlassCard className="mb-6 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Privacy</h3>
                </div>
                <div className="space-y-4">
                  <ToggleRow label="Public Profile" desc="Allow other players to view your synced profile and mining totals." enabled={data.settings.publicProfile} />
                  <ToggleRow label="Session Sharing" desc="Expose recent session summaries to shared dashboards and profile pages." enabled={data.settings.sessionSharing} />
                </div>
              </GlassCard>

              <GlassCard className="mb-6 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Connected Identity</h3>
                </div>
                <div className="glass-panel rounded-lg p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-foreground">{data.player?.username ?? "No synced player yet"}</div>
                      <div className="text-xs text-muted-foreground">
                        {data.viewer ? `Linked as ${data.viewer.username} • Minecraft ${data.player?.lastMinecraftVersion ?? "Version unknown"}` : data.player ? `Minecraft ${data.player.lastMinecraftVersion ?? "Version unknown"} • Privacy-safe identity` : "Once the mod syncs, the Minecraft version and privacy-safe identity status will appear here."}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${data.meta.source === "live" ? "bg-glow-emerald" : "bg-primary"}`} />
                      <span className="text-xs text-muted-foreground">{data.meta.source === "live" ? "Synced" : "Preview"}</span>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Data Management</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" size="sm" className="border-border/50 text-foreground">Export Data (JSON)</Button>
                  <Button variant="outline" size="sm" className="border-border/50 text-foreground">Export Data (CSV)</Button>
                  <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10">Delete All Data</Button>
                </div>
              </GlassCard>
            </>
          )}
        </div>
      </DashboardLayout>
    </div>
  );
}
