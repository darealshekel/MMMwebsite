import { Link } from "react-router-dom";
import { Pickaxe } from "lucide-react";

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
    <footer className="border-t border-border/40 bg-card/30 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Pickaxe className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-bold text-foreground">Ae<span className="text-primary">Tweaks</span></span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Advanced Minecraft mod with synced tracking, analytics, project management, and cloud-powered dashboard.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Product</h4>
            <div className="space-y-2">
              {productLinks.map((l) => (
                <Link key={l.to} to={l.to} className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Community</h4>
            <div className="space-y-2">
              {communityLinks.map((l) => (
                <Link key={l.label} to={l.to} className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="neon-line mt-8 mb-6" />
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-muted-foreground">
          <span>© 2026 AeTweaks. All rights reserved.</span>
          <span className="font-mono">v1.4.2-beta</span>
        </div>
      </div>
    </footer>
  );
}
