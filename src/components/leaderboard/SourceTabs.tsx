import { Link } from "react-router-dom";
import { Network, Trophy } from "lucide-react";
import type { PublicSourceSummary } from "@/lib/types";

function PodiumIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 20V12h5v8" />
      <path d="M10 20V8h5v12" />
      <path d="M16 20V14h4v6" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function SourceTabs({
  publicSources,
  activeSourceSlug,
}: {
  publicSources: PublicSourceSummary[];
  activeSourceSlug: string | null;
}) {
  return (
    <section className="rounded-[28px] border border-white/8 bg-black/10 p-3 backdrop-blur-xl">
      <div className="flex flex-wrap gap-2">
        <Link
          to="/leaderboard"
          className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
            activeSourceSlug === null
              ? "border-primary/30 bg-primary/10 text-foreground"
              : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <PodiumIcon className="h-4 w-4" />
            <span className="text-sm font-semibold">Main Leaderboard</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Combined totals across approved sources</div>
        </Link>

        {publicSources.map((source) => {
          const active = activeSourceSlug === source.slug;
          return (
            <Link
              key={source.id}
              to={`/leaderboard/${source.slug}`}
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                active
                  ? "border-primary/30 bg-primary/10 text-foreground"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                {source.sourceType === "server" ? <Network className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
                <span className="text-sm font-semibold">{source.displayName}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Source-specific leaderboard</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
