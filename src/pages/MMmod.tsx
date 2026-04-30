import { motion } from "framer-motion";
import { Check, Minus } from "lucide-react";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";

const DISCORD_URL = "https://discord.mmmaniacs.com/";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

type FeatureRow = {
  name: string;
  free: boolean;
  plus: boolean;
  premium: boolean;
};

const features: FeatureRow[] = [
  { name: "Basic block counter", free: true, plus: true, premium: true },
  { name: "Session tracking", free: true, plus: true, premium: true },
  { name: "Website leaderboard sync", free: true, plus: true, premium: true },
  { name: "Milestone notifications", free: true, plus: true, premium: true },
  { name: "Live BPH Tracker Overlay", free: false, plus: true, premium: true },
  { name: "Session Pace Indicator", free: false, plus: true, premium: true },
  { name: "Milestone ETA", free: false, plus: true, premium: true },
  { name: "Mining Heatmap", free: false, plus: true, premium: true },
  { name: "Milestone popups", free: false, plus: true, premium: true },
  { name: "Session comparisons", free: false, plus: true, premium: true },
  { name: "Daily / Weekly charts", free: false, plus: true, premium: true },
  { name: "Top Sessions Leaderboard", free: false, plus: true, premium: true },
  { name: "Friend comparisons", free: false, plus: true, premium: true },
  { name: "Favourite block selection", free: false, plus: true, premium: true },
  { name: "Fatigue detection", free: false, plus: true, premium: true },
  { name: "Adaptive Coaching Overlay", free: false, plus: false, premium: true },
  { name: "Auto Sessions Analysis", free: false, plus: false, premium: true },
  { name: "Personal Record Tracker", free: false, plus: false, premium: true },
  { name: "Dynamic HUD", free: false, plus: false, premium: true },
  { name: "Customizable UI themes", free: false, plus: false, premium: true },
  { name: "Overdrive Mode", free: false, plus: false, premium: true },
  { name: "Block-type breakdowns", free: false, plus: false, premium: true },
  { name: "Efficiency per depth", free: false, plus: false, premium: true },
  { name: "Mining Patterns", free: false, plus: false, premium: true },
  { name: "Long-term improvement graphs", free: false, plus: false, premium: true },
  { name: "Rival System", free: false, plus: false, premium: true },
  { name: "Smart Sessions planner", free: false, plus: false, premium: true },
];

const modHighlights = [
  { label: "Real-time tracking", desc: "Every block counted as you mine, zero delay." },
  { label: "Website sync", desc: "Your stats appear on the MMM leaderboard automatically via MMMod." },
  { label: "Session analytics", desc: "Review your past sessions with charts and pace data." },
  { label: "Milestone system", desc: "Get notified the moment you hit a new record." },
  { label: "Overlay HUD", desc: "Live BPH and pace indicators on your screen while you play." },
  { label: "Friend leaderboard", desc: "See how your sessions stack up against your friends." },
];

function Cell({ value }: { value: boolean }) {
  return value ? (
    <Check className="mx-auto h-4 w-4 text-primary" />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
  );
}

export default function MMmod() {
  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      {/* Hero */}
      <section className="relative overflow-hidden grid-bg border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/10 to-background" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="container relative z-10 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-5"
          >
            <div className="inline-flex items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
              <span className="font-pixel text-[9px]">MMMOD</span>
            </div>
            <h1 className="font-pixel text-4xl leading-tight text-foreground md:text-5xl">
              Track Every Block<br />You Mine
              <span className="text-primary animate-blink">_</span>
            </h1>
            <p className="mx-auto max-w-2xl font-display text-2xl leading-snug text-foreground/70">
              MMMod records your mining sessions, syncs your stats to the MMM website, and gives you real-time analytics while you play.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-glow border border-primary/40 bg-primary/10 px-6 py-3 font-pixel text-[9px] text-primary transition-colors hover:bg-primary/20"
              >
                GET THE MOD
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <main className="container space-y-0 divide-y divide-border">

        {/* Features */}
        <section className="py-16">
          <div className="mb-10 text-center">
            <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary mb-2">FEATURES</div>
            <h2 className="font-pixel text-2xl text-foreground">What MMMod does</h2>
          </div>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {modHighlights.map((item) => (
              <motion.div key={item.label} variants={fadeUp} transition={{ duration: 0.35 }}>
                <GlassCard className="h-full p-5 space-y-2">
                  <div className="font-pixel text-[10px] text-primary uppercase tracking-[0.1em]">{item.label}</div>
                  <p className="text-[9px] leading-[1.8] text-muted-foreground">{item.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Pricing */}
        <section className="py-16">
          <div className="mb-10 text-center">
            <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary mb-2">PRICING</div>
            <h2 className="font-pixel text-2xl text-foreground">Plans</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {/* Free */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              transition={{ duration: 0.35 }}
            >
              <GlassCard className="flex h-full flex-col p-6 space-y-4">
                <div className="space-y-1">
                  <div className="font-pixel text-[8px] uppercase tracking-[0.12em] text-muted-foreground">FREE</div>
                  <div className="font-pixel text-3xl text-foreground">€0</div>
                  <div className="font-pixel text-[8px] text-muted-foreground">forever</div>
                </div>
                <p className="text-[9px] leading-[1.8] text-muted-foreground">
                  Core tracking and leaderboard sync. Everything you need to get started.
                </p>
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto block border border-border/60 px-4 py-2.5 text-center font-pixel text-[9px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  DOWNLOAD
                </a>
              </GlassCard>
            </motion.div>

            {/* Plus */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.08 }}
            >
              <GlassCard glow="primary" className="flex h-full flex-col p-6 space-y-4 border-primary/40">
                <div className="space-y-1">
                  <div className="font-pixel text-[8px] uppercase tracking-[0.12em] text-primary">PLUS</div>
                  <div className="font-pixel text-3xl text-foreground">€2.99<span className="text-base text-muted-foreground">/mo</span></div>
                  <div className="font-pixel text-[8px] text-muted-foreground">or €29.99 / year</div>
                </div>
                <p className="text-[9px] leading-[1.8] text-muted-foreground">
                  Live overlays, session analytics, friend leaderboards, and detailed charts.
                </p>
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-glow mt-auto block border border-primary/40 bg-primary/10 px-4 py-2.5 text-center font-pixel text-[9px] text-primary transition-colors hover:bg-primary/20"
                >
                  GET PLUS
                </a>
              </GlassCard>
            </motion.div>

            {/* Premium */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.16 }}
            >
              <GlassCard className="flex h-full flex-col p-6 space-y-4">
                <div className="space-y-1">
                  <div className="font-pixel text-[8px] uppercase tracking-[0.12em] text-primary/80">PREMIUM</div>
                  <div className="font-pixel text-3xl text-foreground">€4.99<span className="text-base text-muted-foreground">/mo</span></div>
                  <div className="font-pixel text-[8px] text-muted-foreground">or €49.99 / year</div>
                </div>
                <p className="text-[9px] leading-[1.8] text-muted-foreground">
                  Everything in Plus, plus adaptive coaching, custom HUD, rival system, and full mining pattern analysis.
                </p>
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto block border border-primary/20 bg-primary/5 px-4 py-2.5 text-center font-pixel text-[9px] text-primary/80 transition-colors hover:bg-primary/10"
                >
                  GET PREMIUM
                </a>
              </GlassCard>
            </motion.div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="py-16">
          <div className="mb-10 text-center">
            <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary mb-2">COMPARE</div>
            <h2 className="font-pixel text-2xl text-foreground">Feature comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-6 text-left font-pixel text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Feature</th>
                  <th className="px-4 py-3 text-center font-pixel text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Free</th>
                  <th className="px-4 py-3 text-center font-pixel text-[9px] uppercase tracking-[0.1em] text-primary">Plus</th>
                  <th className="px-4 py-3 text-center font-pixel text-[9px] uppercase tracking-[0.1em] text-primary/80">Premium</th>
                </tr>
              </thead>
              <tbody>
                {features.map((row, i) => (
                  <tr key={row.name} className={`border-b border-border/40 ${i % 2 === 0 ? "" : "bg-primary/[0.02]"}`}>
                    <td className="py-2.5 pr-6 font-pixel text-[9px] leading-[1.6] text-foreground">{row.name}</td>
                    <td className="px-4 py-2.5 text-center"><Cell value={row.free} /></td>
                    <td className="px-4 py-2.5 text-center"><Cell value={row.plus} /></td>
                    <td className="px-4 py-2.5 text-center"><Cell value={row.premium} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
