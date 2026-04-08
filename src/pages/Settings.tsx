import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Cloud, Bell, Shield, Globe, Palette, Database } from "lucide-react";

const syncSettings = [
  { label: "Auto-Sync Mining Data", desc: "Automatically upload session data after each mining session ends.", enabled: true },
  { label: "Cross-Server Aggregation", desc: "Merge stats from multiple servers into your unified profile.", enabled: true },
  { label: "Real-Time HUD Sync", desc: "Push live HUD data to your cloud dashboard during sessions.", enabled: false },
  { label: "Leaderboard Opt-In", desc: "Allow your stats to appear on public and friends leaderboards.", enabled: true },
];

const privacySettings = [
  { label: "Public Profile", desc: "Allow other players to view your profile and mining stats.", enabled: true },
  { label: "Session Sharing", desc: "Let friends see your live session status and activity.", enabled: false },
];

export default function Settings() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">Settings & Sync</h1>
            <p className="text-sm text-muted-foreground">Manage your sync preferences, privacy, and account settings.</p>
          </motion.div>

          {/* Sync */}
          <GlassCard className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Cloud className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Sync Settings</h3>
            </div>
            <div className="space-y-4">
              {syncSettings.map((s) => (
                <div key={s.label} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.desc}</div>
                  </div>
                  <div className={`w-10 h-6 rounded-full flex items-center px-1 cursor-pointer transition-colors ${s.enabled ? "bg-primary" : "bg-secondary"}`}>
                    <div className={`w-4 h-4 rounded-full transition-transform ${s.enabled ? "bg-primary-foreground translate-x-4" : "bg-muted-foreground translate-x-0"}`} />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Privacy */}
          <GlassCard className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Privacy</h3>
            </div>
            <div className="space-y-4">
              {privacySettings.map((s) => (
                <div key={s.label} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.desc}</div>
                  </div>
                  <div className={`w-10 h-6 rounded-full flex items-center px-1 cursor-pointer transition-colors ${s.enabled ? "bg-primary" : "bg-secondary"}`}>
                    <div className={`w-4 h-4 rounded-full transition-transform ${s.enabled ? "bg-primary-foreground translate-x-4" : "bg-muted-foreground translate-x-0"}`} />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Connected Account */}
          <GlassCard className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Connected Account</h3>
            </div>
            <div className="glass-panel p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">MineGod42</div>
                  <div className="text-xs text-muted-foreground">minegod42@email.com • Premium</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-glow-emerald" />
                  <span className="text-xs text-muted-foreground">Synced</span>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Data */}
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Data Management</h3>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" className="border-border/50 text-foreground">Export Data (JSON)</Button>
              <Button variant="outline" size="sm" className="border-border/50 text-foreground">Export Data (CSV)</Button>
              <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10">Delete All Data</Button>
            </div>
          </GlassCard>
        </div>
      </DashboardLayout>
    </div>
  );
}
