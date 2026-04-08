import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { ProgressRing } from "@/components/ProgressRing";
import { User, Trophy, Pickaxe, Calendar, Globe, Shield } from "lucide-react";

export default function Profile() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard glow="primary" className="p-8 mb-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <User className="w-10 h-10 text-primary" />
                </div>
                <div className="text-center sm:text-left flex-1">
                  <h1 className="text-2xl font-bold text-foreground">MineGod42</h1>
                  <p className="text-sm text-muted-foreground">Premium Account • Synced</p>
                  <div className="flex flex-wrap gap-4 mt-3">
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Joined Mar 2025</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="w-3 h-3" /> 3 servers synced</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="w-3 h-3" /> Profile public</div>
                  </div>
                </div>
                <ProgressRing progress={85} size={80} label="Level 42" />
              </div>
            </GlassCard>

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {[
                { label: "Total Blocks", value: "312,500", icon: Pickaxe },
                { label: "Leaderboard Rank", value: "#1", icon: Trophy },
                { label: "Projects Complete", value: "23", icon: Calendar },
              ].map((s) => (
                <GlassCard key={s.label} className="p-4 text-center">
                  <s.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                  <div className="text-xl font-bold text-foreground">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </GlassCard>
              ))}
            </div>

            <GlassCard className="p-5">
              <h3 className="font-semibold text-foreground mb-4">Synced Worlds & Servers</h3>
              <div className="space-y-3">
                {["HyperCraft SMP", "Vanilla Survival #2", "Creative Build Server"].map((w, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-glow-emerald" />
                      <span className="text-sm text-foreground">{w}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Connected</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </DashboardLayout>
    </div>
  );
}
