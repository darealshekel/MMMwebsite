import { Link } from "react-router-dom";
import mmmLogo from "@/assets/mmm-logo.png";

const productLinks = [
  { label: "Features", to: "/features" },
  { label: "Dashboard", to: "/dashboard" },
  { label: "Projects", to: "/projects" },
  { label: "Sessions", to: "/sessions" },
];

const communityLinks = [
  { label: "Discord", to: "#" },
  { label: "GitHub", to: "#" },
  { label: "Docs", to: "#" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="h-7 w-7 overflow-hidden border border-primary/25 bg-black p-0.5">
                <img src={mmmLogo} alt="MMM logo" className="h-full w-full object-contain" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-foreground">MMM</span>
            </div>
            <p className="max-w-sm text-[10px] leading-[1.8] text-muted-foreground">
              Manual Mining Maniacs is a home for hand-mined records, source leaderboards, and the people who keep digging.
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-[10px] uppercase tracking-[0.1em] text-foreground">Product</h4>
            <div className="space-y-2">
              {productLinks.map((l) => (
                <Link key={l.to} to={l.to} className="block text-[10px] leading-[1.8] text-muted-foreground hover:text-primary transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h4 className="mb-3 text-[10px] uppercase tracking-[0.1em] text-foreground">Community</h4>
            <div className="space-y-2">
              {communityLinks.map((l) => (
                <Link key={l.label} to={l.to} className="block text-[10px] leading-[1.8] text-muted-foreground hover:text-primary transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 text-[8px] leading-[1.8] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>MMM / LOCAL BUILD</span>
          <span>LIVE / SYNCED 2 MIN AGO</span>
        </div>
      </div>
    </footer>
  );
}
