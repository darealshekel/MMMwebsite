import { Flag, Layers3, Milestone as MilestoneIcon, Trophy, Zap, Calendar, Pickaxe, Star } from "lucide-react";
import { Footer } from "@/components/Footer";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";

type OwnerMode = "one-time" | "dynamic" | "multi";

type AchievementEntry = {
  name: string;
  description: string;
  isLegacy?: boolean;
};

type AchievementSection = {
  title: string;
  titleColor: string;
  subtitle: string;
  ownerMode: OwnerMode;
  isLegacy?: boolean;
  entries: AchievementEntry[];
};

function blockRange(
  nameFn: (m: number) => string,
  descFn: (m: number) => string,
): AchievementEntry[] {
  return Array.from({ length: 20 }, (_, i) => {
    const m = (i + 1) * 25;
    return { name: nameFn(m), description: descFn(m) };
  });
}

const achievementSections: AchievementSection[] = [
  // ── GLOBAL ──────────────────────────────────────────────────────────────
  {
    title: "Total First-time Blocks Mined",
    titleColor: "#fe0000",
    subtitle: "These achievements are only given once.",
    ownerMode: "one-time",
    entries: blockRange(
      (m) => `First ${m}M Digs`,
      (m) => `First to dig ${m}M blocks!`,
    ),
  },
  {
    title: "Server First-time Blocks Mined",
    titleColor: "#2bf8ee",
    subtitle: "These achievements are only given once.",
    ownerMode: "one-time",
    entries: blockRange(
      (m) => `First Server ${m}M`,
      (m) => `First Server to dig ${m}M blocks!`,
    ),
  },
  {
    title: "Total Blocks Mined",
    titleColor: "#22c55e",
    subtitle: "Achievement given when the milestone is reached.",
    ownerMode: "multi",
    entries: blockRange(
      (m) => `${m}M Digs`,
      (m) => `Mined ${m}M blocks!`,
    ),
  },
  {
    title: "Global Top",
    titleColor: "#ffd700",
    subtitle: "The achievement changes owner when the leaderboard updates!",
    ownerMode: "dynamic",
    entries: [
      { name: "Global Champion", description: "Given to the current top 1 of Digs." },
      { name: "Global Podium #2-3", description: "Given to the current top 2 and 3 of Digs." },
      { name: "Global Elite #4-10", description: "Given to the current top 4 to 10 of Digs." },
    ],
  },
  {
    title: "Server Top",
    titleColor: "#3b82f6",
    subtitle: "The achievement changes owner when the leaderboard updates!",
    ownerMode: "dynamic",
    entries: [
      { name: "Server Champion", description: "Given to the current top 1 of servers." },
      { name: "Server Podium #2-3", description: "Given to the current top 2 and 3 of servers." },
      { name: "Server Elite #4-10", description: "Given to the current top 4-10 of servers." },
    ],
  },

  // ── GAMEMODE & WORLD ─────────────────────────────────────────────────────
  {
    title: "Blocks in One World",
    titleColor: "#d122fb",
    subtitle: "These achievements are only given once.",
    ownerMode: "one-time",
    entries: blockRange(
      (m) => `Blocks in a World ${m}M`,
      (m) => `First to mine ${m}M blocks in a single world.`,
    ),
  },
  {
    title: "Legacy Blocks in Two Worlds",
    titleColor: "#fefefe",
    subtitle: "This achievement is no longer updated. Only existing achievements will be given.",
    ownerMode: "one-time",
    isLegacy: true,
    entries: [
      { name: "Blocks in Two Worlds 25M", description: "LEGACY ACHIEVEMENT. First to mine 25M in two worlds.", isLegacy: true },
      { name: "Blocks in Two Worlds 50M", description: "LEGACY ACHIEVEMENT. First to mine 50M in two worlds.", isLegacy: true },
    ],
  },
  {
    title: "Singleplayer Blocks",
    titleColor: "#d4af37",
    subtitle: "These achievements are only given once.",
    ownerMode: "one-time",
    entries: blockRange(
      (m) => `In Your Own ${m}M`,
      (m) => `First to mine ${m}M in a singleplayer world.`,
    ),
  },
  {
    title: "Hardcore Blocks",
    titleColor: "#e485bf",
    subtitle: "These achievements are only given once.",
    ownerMode: "one-time",
    entries: blockRange(
      (m) => `Unfazed by Death ${m}M`,
      (m) => `First to mine ${m}M in a Hardcore world.`,
    ),
  },

  // ── SPEED ────────────────────────────────────────────────────────────────
  {
    title: "Speed Achievements",
    titleColor: "#f97316",
    subtitle: "Achievement given when the milestone is reached.",
    ownerMode: "multi",
    entries: [
      { name: "Dig Award", description: "40,000 blocks / hour is reached." },
      { name: "Miner Award", description: "50,000 blocks / hour is reached." },
      { name: "Dig Master", description: "60,000 blocks / hour is reached." },
      { name: "Human Quarry", description: "70,000 blocks / hour is reached." },
    ],
  },

  // ── YEARLY ───────────────────────────────────────────────────────────────
  {
    title: "Yearly Achievements",
    titleColor: "#eab308",
    subtitle: "Yearly achievements are only given once a year. Each year a new one is issued.",
    ownerMode: "dynamic",
    entries: [
      { name: "Yearly Champion", description: "Given for mining the most during a year!" },
      { name: "Yearly Podium #2-3", description: "Given for mining the 2nd or 3rd most during a year!" },
      { name: "Yearly Elite #4-10", description: "Given for being in the top 10 of most digs during a year!" },
    ],
  },

  // ── GRINDING ─────────────────────────────────────────────────────────────
  {
    title: "Block Grinding",
    titleColor: "#84cc16",
    subtitle: "Achievement given when the milestone is reached.",
    ownerMode: "multi",
    entries: [
      { name: "Focused", description: "Mine a single block 500,000 times." },
      { name: "Brain Dead", description: "Mine a single block 1M times." },
      { name: "Still Focusing", description: "Mine a single block 10M times." },
      { name: "Maybe Focusing Some More", description: "Mine a single block 25M times." },
      { name: "Come On!", description: "Mine a single block 50M times." },
      { name: "Keep It Up!", description: "Mine a single block 75M times." },
      { name: "A Focused One Indeed", description: "Mine a single block 100M times." },
      { name: "Singular Obsession", description: "Mine a single block 150M times." },
    ],
  },
  {
    title: "Session Hours",
    titleColor: "#14b8a6",
    subtitle: "Achievement given when the milestone is reached.",
    ownerMode: "multi",
    entries: [
      { name: "First Time!", description: "Use the mod for the 1st time." },
      { name: "Entry Level", description: "Have a total of 100 hours in sessions." },
      { name: "Veteran", description: "Have a total of 500 hours in sessions." },
      { name: "No Life", description: "Have a total of 1,000 hours in sessions." },
      { name: "Part of the Mod", description: "Have a total of 5,000 hours in sessions." },
    ],
  },
  {
    title: "Streaks",
    titleColor: "#8b5cf6",
    subtitle: "Achievement given when the milestone is reached.",
    ownerMode: "multi",
    entries: [
      { name: "Consistent", description: "Achieve a 7-day streak!" },
      { name: "Unstoppable", description: "Achieve a 30-day streak!" },
      { name: "Eternal Miner", description: "Achieve a 60-day streak!" },
    ],
  },
  {
    title: "Precision",
    titleColor: "#0ea5e9",
    subtitle: "Achievement given when the milestone is reached.",
    ownerMode: "multi",
    entries: [
      { name: "Precision", description: "Maintain an average of 40,000 blocks / hour over 10 different sessions." },
      { name: "Optimization", description: "Maintain an average of 50,000 blocks / hour over 10 different sessions." },
    ],
  },
  {
    title: "Endurance",
    titleColor: "#f59e0b",
    subtitle: "Achievement given when the milestone is reached.",
    ownerMode: "multi",
    entries: [
      { name: "Endurance I", description: "Mine for 5 hours in a single session." },
      { name: "Endurance II", description: "Mine for 10 hours in a single session." },
      { name: "Endurance III", description: "Mine for 16 hours in a single session." },
      { name: "Endurance IV", description: "Mine for 24 hours in a single session." },
      { name: "Endurance V", description: "Mine for 48 hours in a single session." },
    ],
  },
];

const totalEntries = achievementSections.reduce((sum, s) => sum + s.entries.length, 0);

function AchievementRow({ entry, ownerMode }: { entry: AchievementEntry; ownerMode: OwnerMode }) {
  const showOwner = ownerMode === "one-time" || ownerMode === "dynamic";

  return (
    <div className="grid items-center gap-3 px-4 py-3.5 bg-card border border-border hover:border-primary/30 transition-colors grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,0.8fr)]">
      <div className="flex items-center gap-2 min-w-0">
        {entry.isLegacy && (
          <span className="shrink-0 font-pixel text-[7px] uppercase tracking-[0.12em] border border-muted-foreground/40 bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
            LEGACY
          </span>
        )}
        <span className="font-pixel text-[10px] leading-[1.45] text-foreground break-words [overflow-wrap:anywhere]">
          {entry.name}
        </span>
      </div>
      <div className="font-pixel text-[9px] leading-[1.6] text-muted-foreground break-words [overflow-wrap:anywhere]">
        {entry.description}
      </div>
      {showOwner ? (
        <div className="font-pixel text-[9px] text-muted-foreground/50 text-left md:text-right">
          {ownerMode === "dynamic" ? "— LIVE —" : "—"}
        </div>
      ) : (
        <div className="hidden md:block" />
      )}
    </div>
  );
}

function AchievementSectionCard({ section }: { section: AchievementSection }) {
  const showOwnerCol = section.ownerMode === "one-time" || section.ownerMode === "dynamic";

  return (
    <section className="pixel-card border border-border p-4 md:p-5 bg-card/70">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-pixel text-lg leading-none" style={{ color: section.titleColor }}>
              {section.title}
            </div>
            {section.isLegacy && (
              <span className="font-pixel text-[7px] uppercase tracking-[0.12em] border border-muted-foreground/40 bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
                LEGACY
              </span>
            )}
            {section.ownerMode === "one-time" && (
              <span className="font-pixel text-[7px] uppercase tracking-[0.12em] border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary">
                FIRST ONLY
              </span>
            )}
            {section.ownerMode === "dynamic" && (
              <span className="font-pixel text-[7px] uppercase tracking-[0.12em] border border-yellow-400/30 bg-yellow-500/10 px-1.5 py-0.5 text-yellow-400">
                CHANGES OWNER
              </span>
            )}
          </div>
          <div className="font-pixel text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
            {section.entries.length} {section.entries.length === 1 ? "achievement" : "achievements"}
          </div>
          <div className="font-pixel text-[8px] leading-[1.6] text-muted-foreground/70 max-w-prose">
            {section.subtitle}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 font-pixel text-[8px] uppercase tracking-[0.12em] text-muted-foreground shrink-0">
          <MilestoneIcon className="h-3 w-3" strokeWidth={2.5} />
          {showOwnerCol ? "Holder" : "Earnable"}
        </div>
      </div>

      {showOwnerCol && (
        <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,0.8fr)] gap-3 px-4 py-2 border-b border-border/50">
          <div className="font-pixel text-[7px] uppercase tracking-[0.14em] text-muted-foreground/60">Achievement</div>
          <div className="font-pixel text-[7px] uppercase tracking-[0.14em] text-muted-foreground/60">Description</div>
          <div className="font-pixel text-[7px] uppercase tracking-[0.14em] text-muted-foreground/60 text-right">
            {section.ownerMode === "dynamic" ? "Current Holder" : "First Holder"}
          </div>
        </div>
      )}

      <div className="space-y-2 pt-3">
        {section.entries.map((entry) => (
          <AchievementRow
            key={entry.name}
            entry={entry}
            ownerMode={section.ownerMode}
          />
        ))}
      </div>
    </section>
  );
}

function AchievementStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  tone: "primary" | "muted";
}) {
  return (
    <div
      className={`flex min-w-0 min-h-[84px] flex-col justify-between gap-2 border px-4 py-3 ${
        tone === "primary" ? "border-primary/40 bg-primary/5" : "border-border bg-card/60"
      }`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`w-3 h-3 ${tone === "primary" ? "text-primary" : ""}`} strokeWidth={2.5} />
        <span className="font-pixel text-[8px] uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-pixel text-[11px] leading-[1.45] text-foreground tabular-nums break-words [overflow-wrap:anywhere]">
        {value}
      </span>
    </div>
  );
}

const sectionGroups = [
  { label: "Global", sections: achievementSections.slice(0, 5) },
  { label: "Gamemode & World", sections: achievementSections.slice(5, 9) },
  { label: "Speed", sections: achievementSections.slice(9, 10) },
  { label: "Yearly", sections: achievementSections.slice(10, 11) },
  { label: "Grinding", sections: achievementSections.slice(11) },
];

export default function BetaAchievements() {
  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container py-6 md:py-8 space-y-6">
        <section className="pixel-card border border-border p-6 md:p-8 grid-bg">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 animate-fade-in">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                  <Trophy className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span className="font-pixel text-[9px]">ACHIEVEMENTS</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-400/30 text-yellow-400">
                  <span className="font-pixel text-[9px]">BETA</span>
                </div>
              </div>
              <h1 className="font-pixel text-3xl md:text-5xl text-foreground leading-tight">
                Beta Achievements
                <span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-display text-2xl text-muted-foreground max-w-2xl leading-tight">
                The full achievement system. Achievements marked <span className="font-pixel text-[10px] text-primary">FIRST ONLY</span> are given once ever. Achievements marked <span className="font-pixel text-[10px] text-yellow-400">CHANGES OWNER</span> update with the leaderboard.
              </p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.2fr)] xl:max-w-[38rem]">
              <AchievementStat icon={Layers3} label="Categories" value={achievementSections.length.toString()} tone="primary" />
              <AchievementStat icon={Flag} label="Achievements" value={totalEntries.toString()} tone="muted" />
              <AchievementStat icon={MilestoneIcon} label="Highest Block Goal" value="500M" tone="muted" />
            </div>
          </div>
        </section>

        {sectionGroups.map((group) => (
          <section key={group.label} className="space-y-4">
            <h2 className="font-pixel text-2xl md:text-3xl">
              {group.label}
              <span className="text-primary animate-blink">_</span>
            </h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {group.sections.map((section) => (
                <AchievementSectionCard key={section.title} section={section} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <Footer />
    </div>
  );
}
