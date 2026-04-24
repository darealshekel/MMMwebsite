import { Link, useLocation } from "react-router-dom";
import mmmNavLogo from "@/assets/mmm-nav-logo.png";

const links = [
  { label: "Leaderboard", to: "/leaderboard" },
  { label: "Milestones", to: "/milestones" },
  { label: "Submit", to: "/submit" },
  { label: "Projects", to: "/projects" },
  { label: "Sessions", to: "/sessions" },
];

export function LeaderboardHeader() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/70 border-b border-border">
      <div className="container relative grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Link to="/" className="z-10 flex items-center gap-3 group" aria-label="MMM landing page">
          <img src={mmmNavLogo} alt="MMM logo" className="h-9 w-9 object-contain" />
          <span className="font-pixel text-sm tracking-widest">MMM</span>
        </Link>

        <nav className="hidden items-center justify-center gap-1 md:flex">
          {links.map((l) => {
            const active =
              l.to === "/leaderboard"
                ? location.pathname === "/leaderboard" || location.pathname.startsWith("/leaderboard/")
                : l.to === "/milestones"
                  ? location.pathname === "/milestones" || location.pathname.startsWith("/milestones/")
                : location.pathname === l.to || (l.to !== "/" && location.pathname.startsWith(`${l.to}/`));
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`font-pixel text-[10px] px-3 py-2 transition-colors ${
                  active
                    ? "text-primary text-glow-primary border border-primary/40 bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label.toUpperCase()}
              </Link>
            );
          })}
        </nav>

        <div className="z-10 flex items-center justify-self-end gap-3">
          <Link
            to="/dashboard"
            className="group relative font-pixel text-[9px] bg-primary text-primary-foreground px-3 py-2.5 hover:bg-primary/90 transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_hsl(0_0%_0%)] shadow-[4px_4px_0_0_hsl(0_0%_0%)]"
          >
            YOUR DASHBOARD
          </Link>
        </div>
      </div>
    </header>
  );
}
