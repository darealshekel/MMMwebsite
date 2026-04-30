import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Flag, Layers3, Milestone as MilestoneIcon, Trophy } from "lucide-react";
import { Footer } from "@/components/Footer";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchLeaderboardSummary, fetchPublicSources } from "@/lib/leaderboard-repository";

type OwnerMode = "one-time" | "dynamic" | "multi";

type AchievementEntry = {
  name: string;
  description: string;
  holder?: string | null;
  date?: string | null;
  badgeUrl?: string;
};

type AchievementSection = {
  id: string;
  title: string;
  titleColor: string;
  subtitle: string;
  ownerMode: OwnerMode;
  isServerSection?: boolean;
  entries: AchievementEntry[];
};

type AchievementGroup = {
  id: string;
  label: string;
  sections: AchievementSection[];
};

type HolderMap = Partial<Record<number, { holder: string; date?: string }>>;

function blockRange(
  nameFn: (m: number) => string,
  descFn: (m: number) => string,
  holders?: HolderMap,
  badges?: Partial<Record<number, string>>,
): AchievementEntry[] {
  return Array.from({ length: 20 }, (_, i) => {
    const m = (i + 1) * 25;
    const h = holders?.[m];
    return {
      name: nameFn(m),
      description: descFn(m),
      holder: h?.holder ?? null,
      date: h?.date ?? null,
      badgeUrl: badges?.[m],
    };
  });
}

const groups: AchievementGroup[] = [
  {
    id: "global",
    label: "Global",
    sections: [
      {
        id: "first-global",
        title: "Total First-time Blocks Mined",
        titleColor: "#fe0000",
        subtitle: "Given to the first user to reach a certain milestone of Global Digs!",
        ownerMode: "one-time",
        entries: blockRange(
          (m) => `First ${m}M Digs`,
          (m) => `First to dig ${m}M blocks!`,
          {
            25: { holder: "DerToniii", date: "10/4/2018" },
            50: { holder: "fougu44", date: "29/6/2021" },
            75: { holder: "fougu44", date: "18/7/2023" },
            100: { holder: "AitorTheK1ng", date: "19/10/2023" },
            125: { holder: "AitorTheK1ng", date: "18/1/2024" },
            150: { holder: "SheronMan", date: "20/4/2024" },
            175: { holder: "SheronMan", date: "07/10/2024" },
            200: { holder: "AitorTheK1ng", date: "16/4/2025" },
            225: { holder: "SheronMan", date: "30/9/2025" },
            250: { holder: "AitorTheK1ng", date: "9/12/2025" },
          },
        ),
      },
      {
        id: "first-server",
        title: "Server First-time Blocks Mined",
        titleColor: "#2bf8ee",
        subtitle: "Given to the first server to reach a milestone on Server Digs!",
        ownerMode: "one-time",
        isServerSection: true,
        entries: blockRange(
          (m) => `First Server ${m}M`,
          (m) => `First Server to dig ${m}M blocks!`,
          {
            25: { holder: "Dugged" },
            50: { holder: "Dugged" },
            75: { holder: "Dugged" },
            100: { holder: "Dugged", date: "?/5/2018" },
            125: { holder: "Dugged", date: "?/9/2018" },
            150: { holder: "Dugged", date: "?/7/2019" },
            175: { holder: "Dugged", date: "?/7/2020" },
            200: { holder: "Dugged", date: "?/3/2021" },
            225: { holder: "Dugged", date: "?/1/2022" },
            250: { holder: "Dugged", date: "?/8/2022" },
            275: { holder: "Dugged", date: "?/3/2023" },
            300: { holder: "Dugged", date: "?/8/2023" },
            325: { holder: "Dugged", date: "?/7/2024" },
            350: { holder: "Sigma SMP", date: "?/2/2025" },
            375: { holder: "Dugged", date: "26/7/2025" },
          },
        ),
      },
      {
        id: "total-blocks",
        title: "Total Blocks Mined",
        titleColor: "#22c55e",
        subtitle: "Given to a user when reaching certain total of blocks mined!",
        ownerMode: "multi",
        entries: blockRange(
          (m) => `${m}M Digs`,
          (m) => `Mined ${m}M blocks!`,
          undefined,
          {
            25: "/badges/badge-25m.png",
            50: "/badges/badge-50m.png",
            75: "/badges/badge-75m.png",
            100: "/badges/badge-100m.png",
          },
        ),
      },
      {
        id: "global-top",
        title: "Global Top",
        titleColor: "#ffd700",
        subtitle: "Current Top of the best 10 Miners ever.",
        ownerMode: "dynamic",
        entries: [],
      },
      {
        id: "server-top",
        title: "Server Top",
        titleColor: "#3b82f6",
        subtitle: "Current Top of the best 10 Servers ever.",
        ownerMode: "dynamic",
        isServerSection: true,
        entries: [],
      },
    ],
  },
  {
    id: "yearly",
    label: "Yearly",
    sections: [
      {
        id: "yearly",
        title: "Yearly Achievements",
        titleColor: "#eab308",
        subtitle: "Yearly achievements are only given once a year. Each year a new one is issued.",
        ownerMode: "dynamic",
        entries: [
          { name: "Yearly Champion", description: "Current #1 of yearly Digs." },
          { name: "Yearly Podium #2", description: "Current #2 of yearly Digs." },
          { name: "Yearly Podium #3", description: "Current #3 of yearly Digs." },
          ...Array.from({ length: 7 }, (_, i) => ({
            name: `Yearly Elite #${i + 4}`,
            description: `Current #${i + 4} of yearly Digs.`,
          })),
        ],
      },
    ],
  },
  {
    id: "gamemode",
    label: "Gamemode & World",
    sections: [
      {
        id: "one-world",
        title: "Blocks in One World",
        titleColor: "#d122fb",
        subtitle: "First to mine a certain amount of blocks in a single world.",
        ownerMode: "one-time",
        entries: blockRange(
          (m) => `Blocks in a World ${m}M`,
          (m) => `First to mine ${m}M blocks in a single world.`,
          {
            25: { holder: "DerToniii", date: "10/4/2018" },
            50: { holder: "fougu44", date: "29/6/2021" },
            75: { holder: "SheronMan", date: "19/9/2023" },
            100: { holder: "SheronMan", date: "12/?/2023" },
            125: { holder: "SheronMan", date: "26/2/2024" },
            150: { holder: "SheronMan", date: "~30/9/2024" },
            175: { holder: "Iktsoi", date: "19/11/2025" },
            200: { holder: "Iktsoi", date: "10/3/2026" },
          },
        ),
      },
      {
        id: "hardcore",
        title: "Hardcore Blocks",
        titleColor: "#e485bf",
        subtitle: "First to mine a certain amount in Hardcore worlds.",
        ownerMode: "one-time",
        entries: blockRange(
          (m) => `Unfazed by Death ${m}M`,
          (m) => `First to mine ${m}M in a Hardcore world.`,
          {
            25: { holder: "Gkey", date: "13/2/2022" },
            50: { holder: "Gkey", date: "12/8/2024" },
            75: { holder: "Ant", date: "22/4/2025" },
            100: { holder: "Ant", date: "7/9/2025" },
            125: { holder: "Ant", date: "31/12/2025" },
          },
        ),
      },
      {
        id: "singleplayer",
        title: "Singleplayer Blocks",
        titleColor: "#d4af37",
        subtitle: "First to mine a certain amount in Singleplayer worlds.",
        ownerMode: "one-time",
        entries: blockRange(
          (m) => `In Your Own ${m}M`,
          (m) => `First to mine ${m}M in a singleplayer world.`,
          {
            25: { holder: "Minthical", date: "18/10/2020" },
            50: { holder: "Brotes23", date: "17/4/2023" },
            75: { holder: "SheronMan", date: "19/9/2023" },
            100: { holder: "SheronMan", date: "12/?/2023" },
            125: { holder: "SheronMan", date: "26/2/2024" },
            150: { holder: "SheronMan", date: "~30/9/2024" },
            175: { holder: "Iktsoi", date: "19/11/2025" },
            200: { holder: "Iktsoi", date: "10/3/2026" },
          },
        ),
      },
    ],
  },
  {
    id: "grinding",
    label: "Grinding",
    sections: [
      {
        id: "block-grinding",
        title: "Block Grinding",
        titleColor: "#84cc16",
        subtitle: "Given when mining a single block the most.",
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
        id: "session-hours",
        title: "Session Hours",
        titleColor: "#14b8a6",
        subtitle: "Given while doing sessions.",
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
        id: "streaks",
        title: "Streaks",
        titleColor: "#8b5cf6",
        subtitle: "Achieve consecutive days to obtain streaks.",
        ownerMode: "multi",
        entries: [
          { name: "Consistent", description: "Achieve a 7-day streak!" },
          { name: "Unstoppable", description: "Achieve a 30-day streak!" },
          { name: "Eternal Miner", description: "Achieve a 60-day streak!" },
        ],
      },
      {
        id: "speed",
        title: "Speed Achievements",
        titleColor: "#f97316",
        subtitle: "Given when mining FAST.",
        ownerMode: "multi",
        entries: [
          { name: "Dig Award", description: "40,000 blocks / hour is reached." },
          { name: "Miner Award", description: "50,000 blocks / hour is reached." },
          { name: "Dig Master", description: "60,000 blocks / hour is reached." },
          { name: "Human Quarry", description: "70,000 blocks / hour is reached." },
        ],
      },
      {
        id: "precision",
        title: "Precision",
        titleColor: "#0ea5e9",
        subtitle: "Given when mining fast, consistently.",
        ownerMode: "multi",
        entries: [
          { name: "Precision", description: "Maintain an average of 40,000 blocks / hour over 10 different sessions." },
          { name: "Optimization", description: "Maintain an average of 50,000 blocks / hour over 10 different sessions." },
        ],
      },
      {
        id: "endurance",
        title: "Endurance",
        titleColor: "#f59e0b",
        subtitle: "Given when having a session for certain amount of hours.",
        ownerMode: "multi",
        entries: [
          { name: "Endurance I", description: "Mine for 5 hours in a single session." },
          { name: "Endurance II", description: "Mine for 10 hours in a single session." },
          { name: "Endurance III", description: "Mine for 16 hours in a single session." },
          { name: "Endurance IV", description: "Mine for 24 hours in a single session." },
          { name: "Endurance V", description: "Mine for 48 hours in a single session." },
        ],
      },
    ],
  },
];

const totalSections = groups.reduce((sum, g) => sum + g.sections.length, 0);
const totalEntries = groups.reduce(
  (sum, g) => sum + g.sections.reduce((s, sec) => s + sec.entries.length, 0),
  0,
) + 10 + 10;

function HolderAvatar({
  holder,
  isServer,
  logoUrl,
}: {
  holder: string;
  isServer: boolean;
  logoUrl: string | null | undefined;
}) {
  return (
    <div className="w-8 h-8 shrink-0 overflow-hidden border border-border bg-secondary flex items-center justify-center">
      {isServer ? (
        logoUrl ? (
          <img src={logoUrl} alt={`${holder} logo`} className="h-full w-full object-contain p-0.5" />
        ) : (
          <Trophy className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2} />
        )
      ) : (
        <PlayerAvatar
          username={holder}
          skinFaceUrl={`https://nmsr.nickac.dev/face/${encodeURIComponent(holder)}`}
          className="w-full h-full border-0 bg-transparent"
          fallbackClassName="text-[8px]"
        />
      )}
    </div>
  );
}

function AchievementRow({
  entry,
  ownerMode,
  isServer,
  sourceLogoMap,
}: {
  entry: AchievementEntry;
  ownerMode: OwnerMode;
  isServer: boolean;
  sourceLogoMap: Map<string, string | null>;
}) {
  const isOneTime = ownerMode === "one-time";
  const isDynamic = ownerMode === "dynamic";
  const isMulti = ownerMode === "multi";

  const holderCol = isOneTime
    ? "grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,0.55fr)]"
    : isDynamic
    ? "grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)]"
    : "grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]";

  return (
    <div className={`grid items-center gap-x-3 px-4 py-3 hover:bg-primary/5 transition-colors ${holderCol}`}>
      {isMulti ? (
        <>
          <div className="flex items-center gap-2 min-w-0">
            {entry.badgeUrl && (
              <img
                src={entry.badgeUrl}
                alt=""
                className="h-14 w-14 shrink-0 object-contain"
              />
            )}
            <span className="font-pixel text-[10px] leading-[1.45] text-foreground break-words [overflow-wrap:anywhere]">
              {entry.name}
            </span>
          </div>
          <span className="font-pixel text-[8px] text-right text-muted-foreground/70">
            {entry.description}
          </span>
        </>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-pixel text-[10px] leading-[1.45] text-foreground break-words [overflow-wrap:anywhere] cursor-help hover:text-primary transition-colors w-fit">
              {entry.name}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-pixel text-[9px] leading-[1.6]">{entry.description}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {isOneTime && (
        <div className="flex items-center gap-2 min-w-0">
          {entry.holder ? (
            <>
              <HolderAvatar
                holder={entry.holder}
                isServer={isServer}
                logoUrl={sourceLogoMap.get(entry.holder.toLowerCase())}
              />
              <span className="font-pixel text-[9px] text-foreground/80 truncate">{entry.holder}</span>
            </>
          ) : (
            <span className="font-pixel text-[9px] text-muted-foreground/50 pl-1">—</span>
          )}
        </div>
      )}

      {isOneTime && (
        <span className="font-pixel text-[8px] text-right text-muted-foreground/70">
          {entry.date ?? "—"}
        </span>
      )}

      {isDynamic && (
        <div className="flex items-center gap-2 min-w-0">
          {entry.holder ? (
            <>
              <HolderAvatar
                holder={entry.holder}
                isServer={isServer}
                logoUrl={sourceLogoMap.get(entry.holder.toLowerCase())}
              />
              <span className="font-pixel text-[9px] text-foreground/80 truncate">{entry.holder}</span>
            </>
          ) : (
            <span className="font-pixel text-[8px] text-yellow-400/60 tracking-widest">LIVE</span>
          )}
        </div>
      )}
    </div>
  );
}

function SectionCard({
  section,
  collapsed,
  onToggle,
  sourceLogoMap,
}: {
  section: AchievementSection;
  collapsed: boolean;
  onToggle: () => void;
  sourceLogoMap: Map<string, string | null>;
}) {
  const isOneTime = section.ownerMode === "one-time";
  const isDynamic = section.ownerMode === "dynamic";
  const showOwnerHeader = isOneTime || isDynamic;

  const headerGrid = isOneTime
    ? "grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,0.55fr)]"
    : "grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)]";

  return (
    <div className="border border-border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-primary/5"
      >
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-pixel text-[13px] leading-none" style={{ color: section.titleColor }}>
              {section.title}
            </span>
            {isOneTime && (
              <span className="font-pixel text-[7px] uppercase tracking-[0.1em] border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary">
                FIRST ONLY
              </span>
            )}
            {isDynamic && (
              <span className="font-pixel text-[7px] uppercase tracking-[0.1em] border border-yellow-400/30 bg-yellow-500/10 px-1.5 py-0.5 text-yellow-400">
                CHANGES OWNER
              </span>
            )}
          </div>
          <p className="font-pixel text-[8px] leading-[1.6] text-muted-foreground">{section.subtitle}</p>
          <p className="font-pixel text-[7px] uppercase tracking-[0.12em] text-muted-foreground/50">
            {section.entries.length} {section.entries.length === 1 ? "achievement" : "achievements"}
          </p>
        </div>
        <div className="shrink-0 mt-0.5 text-muted-foreground">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-border">
          {showOwnerHeader && (
            <div className={`grid gap-x-3 px-4 py-2 border-b border-border/50 bg-background/40 ${headerGrid}`}>
              <span className="font-pixel text-[7px] uppercase tracking-[0.12em] text-muted-foreground/50">Achievement</span>
              <span className="font-pixel text-[7px] uppercase tracking-[0.12em] text-muted-foreground/50">
                {isDynamic ? "Current Holder" : "First Holder"}
              </span>
              {isOneTime && (
                <span className="font-pixel text-[7px] uppercase tracking-[0.12em] text-muted-foreground/50 text-right">Date</span>
              )}
            </div>
          )}
          <div className="divide-y divide-border/30">
            {section.entries.map((entry) => (
              <AchievementRow
                key={entry.name}
                entry={entry}
                ownerMode={section.ownerMode}
                isServer={section.isServerSection ?? false}
                sourceLogoMap={sourceLogoMap}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
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
      className={`flex min-h-[84px] flex-col justify-between gap-2 border px-4 py-3 ${
        tone === "primary" ? "border-primary/40 bg-primary/5" : "border-border bg-card/60"
      }`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`w-3 h-3 ${tone === "primary" ? "text-primary" : ""}`} strokeWidth={2.5} />
        <span className="font-pixel text-[8px] uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-pixel text-[11px] leading-[1.45] text-foreground tabular-nums">{value}</span>
    </div>
  );
}

export default function Achievements() {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const { data: sourcesData } = useQuery({
    queryKey: ["leaderboard-sources"],
    queryFn: fetchPublicSources,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ["leaderboard-top10"],
    queryFn: () => fetchLeaderboardSummary({ page: 1, pageSize: 10 }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const sourceLogoMap = useMemo(
    () => new Map((sourcesData ?? []).map((s) => [s.displayName.trim().toLowerCase(), s.logoUrl ?? null])),
    [sourcesData],
  );

  const top10Players = useMemo(() => leaderboardData?.rows?.slice(0, 10) ?? [], [leaderboardData]);
  const top10Servers = useMemo(
    () => [...(sourcesData ?? [])].sort((a, b) => (b.totalBlocks ?? 0) - (a.totalBlocks ?? 0)).slice(0, 10),
    [sourcesData],
  );

  const enrichedGroups = useMemo<AchievementGroup[]>(() => {
    return groups.map((group) => ({
      ...group,
      sections: group.sections.map((section) => {
        if (section.id === "global-top") {
          return {
            ...section,
            entries: [
              { name: "Global Champion", description: "Current #1 of Digs.", holder: top10Players[0]?.username ?? null },
              { name: "Global Podium #2", description: "Current #2 of Digs.", holder: top10Players[1]?.username ?? null },
              { name: "Global Podium #3", description: "Current #3 of Digs.", holder: top10Players[2]?.username ?? null },
              ...Array.from({ length: 7 }, (_, i) => ({
                name: `Global Elite #${i + 4}`,
                description: `Current #${i + 4} of Digs.`,
                holder: top10Players[i + 3]?.username ?? null,
              })),
            ],
          };
        }
        if (section.id === "server-top") {
          return {
            ...section,
            entries: [
              { name: "Server Champion", description: "Current #1 server.", holder: top10Servers[0]?.displayName ?? null },
              { name: "Server Podium #2", description: "Current #2 server.", holder: top10Servers[1]?.displayName ?? null },
              { name: "Server Podium #3", description: "Current #3 server.", holder: top10Servers[2]?.displayName ?? null },
              ...Array.from({ length: 7 }, (_, i) => ({
                name: `Server Elite #${i + 4}`,
                description: `Current #${i + 4} server.`,
                holder: top10Servers[i + 3]?.displayName ?? null,
              })),
            ],
          };
        }
        return section;
      }),
    }));
  }, [top10Players, top10Servers]);

  const toggleGroup = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleSection = (id: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="flex-1 container py-6 md:py-8 space-y-8">
        {/* Hero */}
        <section className="pixel-card border border-border p-6 md:p-8 grid-bg">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 animate-fade-in">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                  <Trophy className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span className="font-pixel text-[9px]">ACHIEVEMENTS</span>
                </div>
              </div>
              <h1 className="font-pixel text-3xl md:text-5xl text-foreground leading-tight">
                Achievements<span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-display text-xl text-muted-foreground max-w-2xl leading-snug">
                Hover any achievement to see its description.{" "}
                <span className="font-pixel text-[9px] text-primary">FIRST ONLY</span> are given once ever.{" "}
                <span className="font-pixel text-[9px] text-yellow-400">CHANGES OWNER</span> update with the leaderboard.
              </p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-3 xl:max-w-[36rem]">
              <StatCard icon={Layers3} label="Categories" value={totalSections.toString()} tone="primary" />
              <StatCard icon={Flag} label="Achievements" value={totalEntries.toString()} tone="muted" />
              <StatCard icon={MilestoneIcon} label="Highest Goal" value="500M" tone="muted" />
            </div>
          </div>
        </section>

        {/* Groups */}
        {enrichedGroups.map((group) => {
          const groupCollapsed = collapsedGroups.has(group.id);
          return (
            <section key={group.id} className="space-y-3">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center gap-3 text-left group"
              >
                {groupCollapsed
                  ? <ChevronRight className="h-5 w-5 text-primary shrink-0" />
                  : <ChevronDown className="h-5 w-5 text-primary shrink-0" />
                }
                <h2 className="font-pixel text-2xl md:text-3xl group-hover:text-primary/90 transition-colors">
                  {group.label}<span className="text-primary animate-blink">_</span>
                </h2>
                <span className="font-pixel text-[8px] text-muted-foreground">
                  {group.sections.length} {group.sections.length === 1 ? "category" : "categories"}
                </span>
              </button>

              {!groupCollapsed && (
                <div className="columns-1 md:columns-2 gap-3 pl-2">
                  {group.sections.map((section) => (
                    <div key={section.id} className="break-inside-avoid mb-3">
                      <SectionCard
                        section={section}
                        collapsed={collapsedSections.has(section.id)}
                        onToggle={() => toggleSection(section.id)}
                        sourceLogoMap={sourceLogoMap}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>

      <Footer />
    </div>
  );
}
