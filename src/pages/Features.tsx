import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { SectionHeading } from "@/components/SectionHeading";
import {
  Pickaxe, BarChart3, FolderKanban, Target, Bell, Cpu, Trophy,
  MapPin, Cloud, Zap, Shield, Database, Layers
} from "lucide-react";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const features = [
  { icon: Pickaxe, name: "Mining Tracker", desc: "Real-time block tracking with ore-specific analytics, mining rate, and efficiency scores." },
  { icon: FolderKanban, name: "Project Management", desc: "Create mining projects with block targets, milestones, and automatic completion tracking." },
  { icon: Target, name: "Smart Goals", desc: "Daily, weekly, and custom goals with streaks, rewards, and intelligent progress nudges." },
  { icon: BarChart3, name: "Deep Analytics", desc: "Charts, trends, and breakdowns of your mining data — blocks/hour, resource distribution, efficiency." },
  { icon: Cpu, name: "AI-Powered ETA", desc: "Machine learning estimates of project completion based on historical mining patterns." },
  { icon: Trophy, name: "Leaderboards", desc: "Global and friends leaderboards for mining stats, project completions, and streaks." },
  { icon: MapPin, name: "Area Tracking", desc: "Spatial mining analytics by chunk, region, or custom zone with persistent data." },
  { icon: Bell, name: "Smart Notifications", desc: "Alerts for milestones, goal completions, sync events, and project updates." },
  { icon: Cloud, name: "Cloud Sync", desc: "All data syncs to your account. Play on any server, see everything in one dashboard." },
  { icon: Layers, name: "HUD Overlay", desc: "In-game heads-up display showing live stats, project progress, and goal status." },
  { icon: Shield, name: "Privacy Controls", desc: "Full control over what data is synced, shared, and visible on leaderboards." },
  { icon: Database, name: "Data Export", desc: "Export your mining data as JSON or CSV for external analysis and backup." },
];

export default function Features() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-24">
        <div className="container mx-auto px-4">
          <SectionHeading
            tag="Features"
            title="Everything You Need"
            description="AeTweaks is packed with tools for tracking, planning, and analyzing your Minecraft gameplay."
          />
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto"
          >
            {features.map((f) => (
              <motion.div key={f.name} variants={fadeUp}>
                <GlassCard className="h-full hover:glow-border transition-all duration-300 group">
                  <f.icon className="w-6 h-6 text-primary mb-3 group-hover:scale-110 transition-transform" />
                  <h3 className="font-semibold text-foreground mb-1.5">{f.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
