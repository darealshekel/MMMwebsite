import { Flag, Layers3, Milestone as MilestoneIcon, Trophy } from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { Footer } from "@/components/Footer";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { fetchPublicSources } from "@/lib/leaderboard-repository";

type MilestoneEntry = {
  milestone: string;
  name: string;
  date?: string;
};

type MilestoneSection = {
  title: string;
  titleColor: string;
  entries: MilestoneEntry[];
};

const milestoneSections: MilestoneSection[] = [
  {
    title: "Diggy Milestones",
    titleColor: "#fe0000",
    entries: [
      { milestone: "First to 25M", name: "TT", date: "10/4/2018" },
      { milestone: "First to 50M", name: "Fougu", date: "29/6/2021" },
      { milestone: "First to 75M", name: "Fougu", date: "18/7/2023" },
      { milestone: "First to 100M", name: "AitorTheK1ng", date: "19/10/2023" },
      { milestone: "First to 125M", name: "AitorTheK1ng", date: "18/1/2024" },
      { milestone: "First to 150M", name: "SheronMan", date: "20/4/2024" },
      { milestone: "First to 175M", name: "SheronMan", date: "07/10/2024" },
      { milestone: "First to 200M", name: "AitorTheK1ng", date: "16/4/2025" },
      { milestone: "First to 225M", name: "SheronMan", date: "30/9/2025" },
      { milestone: "First to 250M", name: "AitorTheK1ng", date: "9/12/2025" },
    ],
  },
  {
    title: "One World",
    titleColor: "#d122fb",
    entries: [
      { milestone: "First to 25M", name: "TT", date: "10/4/2018" },
      { milestone: "First to 50M", name: "Fougu", date: "29/6/2021" },
      { milestone: "First to 75M", name: "SheronMan", date: "19/9/2023" },
      { milestone: "First to 100M", name: "SheronMan", date: "12/?/2023" },
      { milestone: "First to 125M", name: "SheronMan", date: "26/2/2024" },
      { milestone: "First to 150M", name: "SheronMan", date: "9/~30/2024" },
      { milestone: "First to 175M", name: "Iktsoi", date: "19/11/2025" },
      { milestone: "First to 200M", name: "Iktsoi", date: "10/3/2026" },
    ],
  },
  {
    title: "Two Worlds",
    titleColor: "#fefefe",
    entries: [
      { milestone: "First to 25M", name: "AitorTheK1ng", date: "20/11/2023" },
      { milestone: "First to 50M", name: "AitorTheK1ng", date: "18/1/2025" },
    ],
  },
  {
    title: "Server",
    titleColor: "#2bf8ee",
    entries: [
      { milestone: "First to 25M", name: "TT", date: "10/4/2018" },
      { milestone: "First to 50M", name: "Fougu", date: "29/6/2021" },
      { milestone: "First to 75M", name: "Fougu", date: "?/~5/2024" },
    ],
  },
  {
    title: "Singleplayer",
    titleColor: "#d4af37",
    entries: [
      { milestone: "First to 25M", name: "Minthcial", date: "18/10/2020" },
      { milestone: "First to 50M", name: "Brotes", date: "17/4/2023" },
      { milestone: "First to 75M", name: "SheronMan", date: "19/9/2023" },
      { milestone: "First to 100M", name: "SheronMan", date: "12/?/2023" },
      { milestone: "First to 125M", name: "SheronMan", date: "26/2/2024" },
      { milestone: "First to 150M", name: "SheronMan", date: "~30/9/2024" },
      { milestone: "First to 175M", name: "Iktsoi", date: "19/11/2025" },
      { milestone: "First to 200M", name: "Iktsoi", date: "10/3/2026" },
    ],
  },
  {
    title: "Hardcore",
    titleColor: "#e485bf",
    entries: [
      { milestone: "First to 25M", name: "Gkey", date: "13/2/2022" },
      { milestone: "First to 50M", name: "Gkey", date: "12/8/2024" },
      { milestone: "First to 75M", name: "Ant", date: "22/4/2025" },
      { milestone: "First to 100M", name: "Ant", date: "7/9/2025" },
      { milestone: "First to 125M", name: "Ant", date: "31/12/2025" },
    ],
  },
  {
    title: "Server Achievements",
    titleColor: "#0000ff",
    entries: [
      { milestone: "First to 25M", name: "Dugged" },
      { milestone: "First to 50M", name: "Dugged" },
      { milestone: "First to 75M", name: "Dugged" },
      { milestone: "First to 100M", name: "Dugged", date: "?/5/2018" },
      { milestone: "First to 125M", name: "Dugged", date: "?/9/2018" },
      { milestone: "First to 150M", name: "Dugged", date: "?/7/2019" },
      { milestone: "First to 175M", name: "Dugged", date: "?/7/2020" },
      { milestone: "First to 200M", name: "Dugged", date: "?/3/2021" },
      { milestone: "First to 225M", name: "Dugged", date: "?/1/2022" },
      { milestone: "First to 250M", name: "Dugged", date: "?/8/2022" },
      { milestone: "First to 275M", name: "Dugged", date: "?/3/2023" },
      { milestone: "First to 300M", name: "Dugged", date: "?/8/2023" },
      { milestone: "First to 325M", name: "Dugged", date: "?/7/2024" },
      { milestone: "First to 350M", name: "Sigma SMP", date: "?/2/2025" },
      { milestone: "First to 375M", name: "Dugged", date: "26/7/2025" },
    ],
  },
];

const totalEntries = milestoneSections.reduce((sum, section) => sum + section.entries.length, 0);

export default function Milestones() {
  const { data } = useQuery({
    queryKey: ["leaderboard-sources"],
    queryFn: fetchPublicSources,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const sourceLogoMap = useMemo(
    () =>
      new Map(
        (data ?? []).map((source) => [source.displayName.trim().toLowerCase(), source.logoUrl ?? null]),
      ),
    [data],
  );

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container py-6 md:py-8 space-y-6">
        <section className="pixel-card border border-border p-6 md:p-8 grid-bg">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 animate-fade-in">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                <Trophy className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span className="font-pixel text-[9px]">ACHIEVEMENTS</span>
              </div>
              <h1 className="font-pixel text-3xl md:text-5xl text-foreground leading-tight">
                Achievements
                <span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-display text-2xl text-muted-foreground max-w-2xl leading-tight">
                Historic firsts across the leaderboard! Check here the fastest on every category.
              </p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.2fr)] xl:max-w-[38rem]">
              <MilestoneStat icon={Layers3} label="Sections" value={milestoneSections.length.toString()} tone="primary" />
              <MilestoneStat icon={Flag} label="Records" value={totalEntries.toString()} tone="muted" />
              <MilestoneStat icon={MilestoneIcon} label="Highest Achievement" value="375M" tone="muted" />
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="font-pixel text-2xl md:text-3xl">
            Record Archive
            <span className="text-primary animate-blink">_</span>
          </h2>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {milestoneSections.map((section) => (
              <section key={section.title} className="pixel-card border border-border p-4 md:p-5 bg-card/70">
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-pixel text-lg leading-none" style={{ color: section.titleColor }}>
                        {section.title}
                      </div>
                      {section.title === "Two Worlds" && (
                        <span className="font-pixel text-[7px] uppercase tracking-[0.12em] border border-muted-foreground/40 bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
                          LEGACY
                        </span>
                      )}
                    </div>
                    <div className="font-pixel text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
                      {section.entries.length} {section.entries.length === 1 ? "record" : "records"}
                      {section.title === "Two Worlds" && " • no longer updated"}
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-2 font-pixel text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
                    <MilestoneIcon className="h-3 w-3" strokeWidth={2.5} />
                    Achievement Archive
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  {section.entries.map((entry) => (
                    <MilestoneRow
                      key={`${section.title}:${entry.milestone}:${entry.name}:${entry.date ?? "no-date"}`}
                      sectionTitle={section.title}
                      milestone={entry.milestone}
                      name={entry.name}
                      date={entry.date}
                      sourceLogoUrl={sourceLogoMap.get(entry.name.trim().toLowerCase()) ?? null}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function MilestoneStat({
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

function MilestoneRow({
  sectionTitle,
  milestone,
  name,
  date,
  sourceLogoUrl,
}: {
  sectionTitle: string;
  milestone: string;
  name: string;
  date?: string;
  sourceLogoUrl?: string | null;
}) {
  const isServerMilestone = sectionTitle === "Server Achievements";

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,0.7fr)] gap-3 items-center px-4 py-3.5 bg-card border border-border hover:border-primary/30 transition-colors">
      <div className="font-pixel text-[10px] leading-[1.45] text-foreground break-words [overflow-wrap:anywhere]">
        <MilestoneLabel milestone={milestone} />
      </div>
      <div className="flex items-center gap-3 min-w-0">
        <MilestoneIdentity name={name} isServerMilestone={isServerMilestone} sourceLogoUrl={sourceLogoUrl} />
        <div className="font-pixel text-[10px] leading-[1.45] text-foreground/90 break-words [overflow-wrap:anywhere] min-w-0">
          {name}
        </div>
      </div>
      <div className="font-pixel text-[10px] leading-[1.45] text-muted-foreground text-left md:text-right break-words [overflow-wrap:anywhere]">
        {date ?? "—"}
      </div>
    </div>
  );
}

function MilestoneLabel({ milestone }: { milestone: string }) {
  const match = milestone.match(/^(.+?\s)(\d+)M$/);
  if (!match) {
    return milestone;
  }

  const [, prefix, amount] = match;
  const numericValue = Number(amount) * 1_000_000;

  return (
    <>
      <span>{prefix}</span>
      <BlocksMinedValue as="span" value={numericValue} className="font-pixel text-[10px] leading-[1.45] inline">
        {`${amount}M`}
      </BlocksMinedValue>
    </>
  );
}

function MilestoneIdentity({
  name,
  isServerMilestone,
  sourceLogoUrl,
}: {
  name: string;
  isServerMilestone: boolean;
  sourceLogoUrl?: string | null;
}) {
  if (isServerMilestone) {
    return (
      <div className="w-10 h-10 grid place-items-center bg-secondary border border-border overflow-hidden shrink-0">
        {sourceLogoUrl ? (
          <img src={sourceLogoUrl} alt={`${name} logo`} className="h-full w-full object-contain p-1" />
        ) : (
          <Trophy className="w-4 h-4 text-muted-foreground" strokeWidth={2.5} />
        )}
      </div>
    );
  }

  return (
    <div className="w-10 h-10 grid place-items-center bg-secondary border border-border overflow-hidden shrink-0">
      <PlayerAvatar
        username={name}
        skinFaceUrl={`https://nmsr.nickac.dev/face/${encodeURIComponent(name)}`}
        className="w-full h-full border-0 bg-transparent"
        fallbackClassName="text-[10px]"
      />
    </div>
  );
}
