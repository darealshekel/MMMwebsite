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
    <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-md">
      <div className="container relative grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Link to="/" className="z-10 flex items-center gap-3 group" aria-label="MMM landing page">
          <img src={mmmNavLogo} alt="MMM logo" className="h-9 w-9 object-contain" />
          <span className="font-pixel text-sm tracking-widest">MMM</span>
        </Link>

        <nav className="hidden items-center justify-center gap-1 md:flex">
          {links.map((link) => {
            const active =
              link.to === "/leaderboard"
                ? location.pathname === "/leaderboard" || location.pathname.startsWith("/leaderboard/")
                : link.to === "/milestones"
                  ? location.pathname === "/milestones" || location.pathname.startsWith("/milestones/")
                  : location.pathname === link.to || location.pathname.startsWith(`${link.to}/`);

            return (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 font-pixel text-[10px] transition-colors ${
                  active
                    ? "border border-primary/40 bg-primary/10 text-primary text-glow-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label.toUpperCase()}
              </Link>
            );
          })}
        </nav>

        <div className="z-10 flex items-center justify-self-end gap-3">
          <Link
            to="/dashboard"
            className="bg-primary px-3 py-2.5 font-pixel text-[9px] text-primary-foreground shadow-[4px_4px_0_0_hsl(0_0%_0%)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[6px_6px_0_0_hsl(0_0%_0%)]"
          >
            YOUR DASHBOARD
          </Link>
        </div>
      </div>
    </header>
  );
}
