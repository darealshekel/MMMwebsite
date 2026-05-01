import { Link } from "react-router-dom";
import { Network, Trophy } from "lucide-react";
import type { PublicSourceSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { HSP_SOURCE_LOGO_URL, SSP_SOURCE_LOGO_URL } from "../../../shared/source-classification.js";

const PLAYER_DIGS_ICON_URL = "/diamond-pickaxe.png";

const DEFAULT_SSPHSP_ICONS = {
  ssp: SSP_SOURCE_LOGO_URL,
  hsp: HSP_SOURCE_LOGO_URL,
} as const;

type DirectoryKey = "private-server-digs" | "ssp" | "hsp" | "ssp-hsp";

export function SourceTabs({
  publicSources,
  activeSourceSlug,
  activeDirectory = null,
  currentSource,
  ssphspIcons,
}: {
  publicSources: PublicSourceSummary[];
  activeSourceSlug: string | null;
  activeDirectory?: DirectoryKey | null;
  currentSource?: PublicSourceSummary | null;
  ssphspIcons?: { ssp?: string | null; hsp?: string | null } | null;
}) {
  const resolvedSsphspIcons = {
    ssp: ssphspIcons?.ssp ?? DEFAULT_SSPHSP_ICONS.ssp,
    hsp: ssphspIcons?.hsp ?? DEFAULT_SSPHSP_ICONS.hsp,
  };
  const ssphspTextClass = activeDirectory === "private-server-digs" || activeDirectory === "ssp" || activeDirectory === "hsp" || activeDirectory === "ssp-hsp"
    ? "text-[#CCCCCC]"
    : undefined;

  return (
    <section className="source-scrollbar pixel-card overflow-x-auto p-2">
      <div className="flex min-w-max items-center gap-1">
        <Link
          to="/leaderboard"
          className={`flex items-center gap-2 border px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.06em] transition-colors ${
            activeSourceSlug === null && !activeDirectory
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-transparent bg-card/60 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
          }`}
        >
          <img src={PLAYER_DIGS_ICON_URL} alt="Player Digs icon" className="h-6 w-6 shrink-0 object-contain align-middle" />
          <span>Player Digs</span>
        </Link>

        <Link
          to="/leaderboard/private-server-digs"
          className={`flex items-center gap-2 border px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.06em] transition-colors ${
            activeDirectory === "private-server-digs"
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-transparent bg-card/60 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
          }`}
        >
          <Network className="h-3.5 w-3.5" />
          <span>Server Digs</span>
        </Link>

        <Link
          to="/leaderboard/ssp"
          className={`flex items-center gap-2 border px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.06em] transition-colors ${
            activeDirectory === "ssp" || activeDirectory === "ssp-hsp"
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-transparent bg-card/60 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
          }`}
        >
          {resolvedSsphspIcons.ssp ? (
            <img src={resolvedSsphspIcons.ssp} alt="SSP icon" className="h-6 w-6 shrink-0 object-contain align-middle" />
          ) : (
            <Trophy className="h-6 w-6 shrink-0" />
          )}
          <span className={cn("whitespace-nowrap leading-none", ssphspTextClass)}>SSP</span>
        </Link>

        <Link
          to="/leaderboard/hsp"
          className={`flex items-center gap-2 border px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.06em] transition-colors ${
            activeDirectory === "hsp"
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-transparent bg-card/60 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
          }`}
        >
          {resolvedSsphspIcons.hsp ? (
            <img src={resolvedSsphspIcons.hsp} alt="HSP icon" className="h-6 w-6 shrink-0 object-contain align-middle" />
          ) : (
            <Trophy className="h-6 w-6 shrink-0" />
          )}
          <span className={cn("whitespace-nowrap leading-none", ssphspTextClass)}>HSP</span>
        </Link>

        {currentSource && activeSourceSlug ? (
          <Link
            to={`/leaderboard/${currentSource.slug}`}
            className="flex items-center gap-2 border border-primary/40 bg-primary/15 px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.06em] text-primary transition-colors"
          >
            {currentSource.logoUrl ? (
              <img src={currentSource.logoUrl} alt={`${currentSource.displayName} logo`} className="h-4 w-4 object-contain" />
            ) : currentSource.sourceType === "server" ? (
              <Network className="h-3.5 w-3.5" />
            ) : (
              <Trophy className="h-3.5 w-3.5" />
            )}
            <span>{currentSource.displayName}</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
