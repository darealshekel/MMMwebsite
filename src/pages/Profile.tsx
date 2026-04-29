import { motion } from "framer-motion";
import { Calendar, Clock, Globe, LogOut, Pickaxe, ShieldCheck, Trophy, User } from "lucide-react";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { AuthRequiredState } from "@/components/AuthRequiredState";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { SkeletonProfile } from "@/components/Skeleton";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { Button } from "@/components/ui/button";
import { useAeTweaksSnapshot } from "@/hooks/use-aetweaks-snapshot";
import { signOutEverywhere } from "@/lib/browser-auth";

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeAgo(value?: string | null) {
  if (!value) return "Just now";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Profile() {
  const { data, isLoading } = useAeTweaksSnapshot();
  const requiresAuth = data?.meta.source === "auth_required";

  const quickStats = data
    ? [
        {
          label: "Total Blocks Mined",
          value: data.player?.totalSyncedBlocks ?? 0,
          icon: Pickaxe,
          footer: data.player?.lastServerName ?? "No sync yet",
          isBlocksMined: true,
        },
        {
          label: "Aeternum Blocks",
          value: data.player?.aeternumTotalDigs ?? 0,
          icon: Trophy,
          footer: data.player?.aeternumTotalDigs != null ? "Authoritative digs total" : "No Aeternum sync yet",
          isBlocksMined: true,
        },
        {
          label: "Leaderboard Rank",
          value: data.leaderboard?.rankCached != null ? `#${data.leaderboard.rankCached}` : "—",
          icon: Trophy,
          footer: data.leaderboard?.updatedAt ? `Updated ${formatTimeAgo(data.leaderboard.updatedAt)}` : "No public entry yet",
        },
        {
          label: "Projects Synced",
          value: String(data.projects.length),
          icon: Calendar,
          footer: `${data.worlds.length} tracked ${data.worlds.length === 1 ? "world" : "worlds"}`,
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />
      <DashboardLayout>
        <div className="space-y-6">
          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <SkeletonProfile />
            </motion.div>
          )}

          {!isLoading && requiresAuth && (
            <AuthRequiredState
              title="Profile Locked"
              subtitle="Log in to view the profile for your linked Minecraft identity only."
            />
          )}

          {!isLoading && data && !requiresAuth && (
            <div className="space-y-6">
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pixel-card grid-bg p-6 md:p-8">
                <div className="flex flex-col gap-4">
                  <div className="inline-flex w-fit items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                    <span className="font-pixel text-[9px]">PRIVATE PROFILE</span>
                  </div>
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)] xl:items-end">
                    <div className="space-y-2">
                      <h1 className="font-pixel text-3xl leading-tight text-foreground md:text-5xl">
                        {(data.viewer?.username ?? data.player?.username ?? "Single Player Profile").toUpperCase()}
                        <span className="animate-blink text-primary">_</span>
                      </h1>
                      <p className="max-w-2xl font-display text-2xl leading-tight text-muted-foreground">
                        {data.viewer
                          ? `Secure synced profile for ${data.viewer.username}.`
                          : "Secure synced profile for your linked Minecraft identity."}
                      </p>
                    </div>
                    <div className="w-full xl:justify-self-end xl:max-w-[32rem]">
                      <SyncStatusBanner meta={data.meta} />
                    </div>
                  </div>
                </div>
              </motion.section>

              {data.viewer && (
                <GlassCard>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="flex items-center gap-4">
                      {data.viewer.avatarUrl ? (
                        <img src={data.viewer.avatarUrl} alt={data.viewer.username} className="h-16 w-16 border border-primary/20 bg-secondary" />
                      ) : (
                        <div className="grid h-16 w-16 place-items-center border border-primary/20 bg-secondary">
                          <User className="h-8 w-8 text-primary" />
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="font-pixel text-sm text-foreground">{data.viewer.username}</div>
                        <div className="text-[9px] leading-[1.7] text-muted-foreground">
                          Linked via {data.viewer.provider} • Last synced {formatTimeAgo(data.lastSyncedAt)}
                        </div>
                        <div className="text-[9px] leading-[1.7] text-muted-foreground">
                          First seen {formatDate(data.player?.firstSeenAt)} • Minecraft {data.player?.lastMinecraftVersion ?? "Unknown"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-stretch gap-3 md:items-end">
                      <div className="pixel-card px-4 py-3 text-left md:min-w-[16rem] md:text-right">
                        <div className="font-pixel text-[8px] text-muted-foreground">PLAYER-ONLY DATA SCOPE</div>
                        <div className="mt-1 font-pixel text-[10px] text-foreground">UUID-LINKED SECURE VIEW</div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 border-border/50"
                        onClick={() => void signOutEverywhere()}
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              )}

              <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {quickStats.map((stat) => (
                  <motion.div key={stat.label} variants={fadeUp} className="h-full">
                    <GlassCard className="grid h-full min-h-[7.75rem] grid-rows-[auto_1fr_auto] p-4">
                      <div className="flex min-h-[2.25rem] items-start justify-between gap-2">
                        <span className="pr-2 font-pixel text-[8px] leading-[1.5] text-muted-foreground">{stat.label}</span>
                        <stat.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                      </div>
                      {stat.isBlocksMined ? (
                        <BlocksMinedValue as="div" value={typeof stat.value === "number" ? stat.value : 0} className="flex items-end font-pixel text-xl md:text-2xl">
                          {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                        </BlocksMinedValue>
                      ) : (
                        <div className="flex items-end font-pixel text-xl text-foreground md:text-2xl">{stat.value}</div>
                      )}
                      <div className="flex min-h-[1rem] items-center gap-1 self-end">
                        <Clock className="h-3 w-3 text-primary/70" />
                        <span className="text-[8px] leading-[1.5] text-muted-foreground">{stat.footer}</span>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </motion.div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
                <GlassCard className="h-full">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-pixel text-[10px] text-foreground">SYNCED WORLDS & SERVERS</h3>
                    <span className="font-pixel text-[8px] text-primary">{data.worlds.length} TRACKED</span>
                  </div>
                  <div className="space-y-3">
                    {data.worlds.length === 0 ? (
                      <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO WORLD OR SERVER STATS HAVE SYNCED YET.</div>
                    ) : (
                      data.worlds.map((world) => (
                        <div key={world.id} className="pixel-card px-4 py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="font-pixel text-[10px] text-foreground">{world.displayName}</div>
                              <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">
                                {world.kind.toUpperCase()} • Last seen {formatDate(world.lastSeenAt)}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <BlocksMinedValue as="div" value={world.totalBlocks} className="font-pixel text-[10px]">
                                {world.totalBlocks.toLocaleString()}
                              </BlocksMinedValue>
                              <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">{world.totalSessions} sessions</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </GlassCard>

                <GlassCard className="h-full">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-pixel text-[10px] text-foreground">PROFILE SIGNALS</h3>
                    <span className="font-pixel text-[8px] text-primary">LIVE STATE</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="pixel-card p-4">
                      <div className="flex items-center gap-2 font-pixel text-[8px] text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        FIRST SEEN
                      </div>
                      <div className="mt-1 font-pixel text-[10px] text-foreground">{formatDate(data.player?.firstSeenAt)}</div>
                    </div>
                    <div className="pixel-card p-4">
                      <div className="flex items-center gap-2 font-pixel text-[8px] text-muted-foreground">
                        <Globe className="h-3.5 w-3.5" />
                        MINECRAFT VERSION
                      </div>
                      <div className="mt-1 font-pixel text-[10px] text-foreground">{data.player?.lastMinecraftVersion ?? "UNKNOWN"}</div>
                    </div>
                    <div className="pixel-card p-4">
                      <div className="flex items-center gap-2 font-pixel text-[8px] text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        TRUST LEVEL
                      </div>
                      <div className="mt-1 font-pixel text-[10px] text-foreground">{(data.player?.trustLevel ?? "UNKNOWN").toUpperCase()}</div>
                    </div>
                    <div className="pixel-card p-4">
                      <div className="flex items-center gap-2 font-pixel text-[8px] text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        LAST MOD VERSION
                      </div>
                      <div className="mt-1 font-pixel text-[10px] text-foreground">{data.player?.lastModVersion ?? "UNKNOWN"}</div>
                    </div>
                  </div>
                </GlassCard>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </div>
  );
}
