import { Crown, Medal, Trophy, Users, Award } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { useCountUp, formatNumber } from "@/hooks/useCountUp";
import type { LeaderboardRowSummary } from "@/lib/types";

const DEFAULT_STEVE_FULLBODY_URL = "https://nmsr.nickac.dev/fullbody/Steve";
const WHITESPACE_USERNAME = /\s/;

function withSoftWrapSeparators(value: string) {
  return value.replace(/,/g, ",\u200B");
}

export function TopMinersPodium({ rows, countLabel = "PLACES" }: { rows: LeaderboardRowSummary[]; countLabel?: string }) {
  const championRow = rows[0];
  const silverRow = rows[1];
  const bronzeRow = rows[2];
  const fullBodyUrl = (username: string) => WHITESPACE_USERNAME.test(username.trim())
    ? DEFAULT_STEVE_FULLBODY_URL
    : `https://nmsr.nickac.dev/fullbody/${encodeURIComponent(username)}`;
  const podiumGradients = {
    champion: "var(--gradient-gold)",
    silver: "var(--gradient-silver)",
    bronze: "var(--gradient-bronze)",
  };

  const podium = [
    silverRow && {
      rank: 2,
      slug: silverRow.username,
      name: silverRow.username,
      blocksNum: silverRow.blocksMined,
      places: silverRow.sourceCount,
      img: fullBodyUrl(silverRow.username),
      label: "SILVER",
      Icon: Medal,
      bg: podiumGradients.silver,
      hoverBorder: "hsl(var(--silver) / 0.72)",
      hoverShadow: "hsl(var(--silver) / 0.82)",
      height: "h-[440px]",
      glow: "",
      riseDelay: 200,
    },
    championRow && {
      rank: 1,
      slug: championRow.username,
      name: championRow.username,
      blocksNum: championRow.blocksMined,
      places: championRow.sourceCount,
      img: fullBodyUrl(championRow.username),
      label: "CHAMPION",
      Icon: Crown,
      bg: podiumGradients.champion,
      hoverBorder: "hsl(var(--gold) / 0.78)",
      hoverShadow: "hsl(var(--gold) / 0.88)",
      height: "h-[480px]",
      glow: "shadow-[0_0_60px_-10px_hsl(var(--gold)/0.55)]",
      riseDelay: 400,
    },
    bronzeRow && {
      rank: 3,
      slug: bronzeRow.username,
      name: bronzeRow.username,
      blocksNum: bronzeRow.blocksMined,
      places: bronzeRow.sourceCount,
      img: fullBodyUrl(bronzeRow.username),
      label: "BRONZE",
      Icon: Award,
      bg: podiumGradients.bronze,
      hoverBorder: "hsl(var(--bronze) / 0.76)",
      hoverShadow: "hsl(var(--bronze) / 0.84)",
      height: "h-[420px]",
      glow: "",
      riseDelay: 0,
    },
  ].filter(Boolean) as Array<{
    rank: number;
    slug: string;
    name: string;
    blocksNum: number;
    places: number;
    img: string;
    label: string;
    Icon: typeof Crown;
    bg: string;
    hoverBorder: string;
    hoverShadow: string;
    height: string;
    glow: string;
    riseDelay: number;
  }>;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-6 items-end">
      {podium.map((p) => (
        <PodiumCard key={p.rank} {...p} countLabel={countLabel} />
      ))}
    </div>
  );
}

export function TopStatsRow({
  topMiner,
  players,
  totalBlocks,
}: {
  topMiner: string;
  players: number;
  totalBlocks: number;
}) {
  return (
    <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)_minmax(0,1.4fr)] xl:max-w-[38rem]">
      <StatChip icon={Crown} label="Top Miner" value={topMiner} tone="primary" />
      <StatChip icon={Users} label="Players" value={players} tone="muted" />
      <StatChip icon={Trophy} label="Blocks Mined" value={totalBlocks} tone="muted" />
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Crown;
  label: string;
  value: string | number;
  tone: "primary" | "muted";
}) {
  const isNumber = typeof value === "number";
  const counted = useCountUp(isNumber ? (value as number) : 0, { duration: 1800, start: isNumber });

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
        {withSoftWrapSeparators(isNumber ? formatNumber(counted) : String(value))}
      </span>
    </div>
  );
}

function PodiumCard({
  rank,
  slug,
  name,
  blocksNum,
  places,
  img,
  label,
  Icon,
  bg,
  hoverBorder,
  hoverShadow,
  height,
  glow,
  riseDelay,
  countLabel,
}: {
  rank: number;
  slug: string;
  name: string;
  blocksNum: number;
  places: number;
  img: string;
  label: string;
  Icon: typeof Crown;
  bg: string;
  hoverBorder: string;
  hoverShadow: string;
  height: string;
  glow: string;
  riseDelay: number;
  countLabel: string;
}) {
  const isChampion = rank === 1;
  const counted = useCountUp(blocksNum, { duration: 2000, delay: riseDelay + 300 });

  return (
    <Link
      to={`/player/${encodeURIComponent(slug.toLowerCase())}`}
      className="group block relative animate-podium-rise transition-[transform,filter] duration-300 ease-out hover:-translate-y-2 hover:scale-[1.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      style={{ animationDelay: `${riseDelay}ms` }}
    >
      <div className={isChampion ? "animate-float-slow" : ""}>
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 border font-pixel text-[9px] ${
              rank === 1
                ? "bg-gold text-background border-gold-deep text-glow-gold"
                : rank === 2
                  ? "bg-silver text-background border-silver-deep"
                  : "bg-bronze text-background border-bronze-deep"
            }`}
          >
            <Icon className="w-3 h-3" strokeWidth={2.5} />
            {label}
          </div>
        </div>

        <div
          className={`relative ${height} flex flex-col items-center justify-end p-4 border border-border overflow-hidden ${glow} transition-[box-shadow,border-color,filter] duration-300 group-hover:border-[var(--podium-hover-border)] group-hover:brightness-110 group-hover:shadow-[0_22px_58px_-32px_var(--podium-hover-shadow)] ${
            isChampion ? "animate-champion-glow" : ""
          }`}
          style={
            {
              background: bg,
              "--podium-hover-border": hoverBorder,
              "--podium-hover-shadow": hoverShadow,
            } as CSSProperties
          }
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(hsl(0 0% 100% / 0.08) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.08) 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-[0.35]"
            style={{ background: bg, mixBlendMode: "screen" }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(120deg, transparent 16%, hsl(0 0% 100% / 0.11) 46%, transparent 74%)",
              mixBlendMode: "screen",
            }}
          />

          {isChampion && (
            <>
              <div
                className="absolute inset-x-0 top-0 h-2/3 opacity-60 pointer-events-none"
                style={{ background: "radial-gradient(ellipse at top, hsl(var(--gold) / 0.4), transparent 70%)" }}
              />
              <div
                className="absolute inset-y-0 -inset-x-1/2 pointer-events-none animate-spotlight-sweep"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, hsl(var(--gold) / 0.45) 45%, hsl(0 0% 100% / 0.35) 50%, hsl(var(--gold) / 0.45) 55%, transparent 100%)",
                  mixBlendMode: "screen",
                }}
              />
            </>
          )}

          <div className="relative z-[1] h-[60%] flex items-end justify-center">
            {/* Shadow clone — same position as skin, shifted slightly right+down */}
            <img
              src={img}
              alt=""
              aria-hidden
              width={512}
              height={640}
              className="absolute inset-0 w-auto h-full object-contain"
              style={{
                imageRendering: "pixelated",
                transform: "translate(8px, 10px)",
                filter: "brightness(0) opacity(0.4)",
              }}
            />
            <img
              src={img}
              alt={name}
              width={512}
              height={640}
              loading="lazy"
              className="relative z-[1] w-auto h-full object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          <div className="relative z-[1] text-center space-y-1.5 pt-3 w-full">
            <div className="font-pixel text-[10px] text-foreground/70">#{rank}</div>
            <div className="font-pixel text-sm leading-[1.35] text-foreground break-words [overflow-wrap:anywhere]">{name}</div>
            <BlocksMinedValue
              as="div"
              value={blocksNum}
              className="font-pixel text-base leading-[1.25] break-words [overflow-wrap:anywhere]"
            >
              {withSoftWrapSeparators(formatNumber(counted))}
            </BlocksMinedValue>
            <div className="font-pixel text-[8px] text-foreground/60 tracking-widest">BLOCKS MINED</div>
            <div className="inline-block mt-2 px-2 py-1 bg-background/40 border border-foreground/10 font-pixel text-[8px] text-foreground/70">
              {places} {countLabel}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
