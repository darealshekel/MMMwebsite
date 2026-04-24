import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import mmmLogo from "@/assets/mmm-logo.png";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";

const navLinks = [
  { label: "Features", to: "/features" },
  { label: "Dashboard", to: "/dashboard" },
  { label: "Account", to: "/account" },
  { label: "Leaderboard", to: "/leaderboard" },
  { label: "Milestones", to: "/milestones" },
  { label: "Submit", to: "/submit" },
  { label: "Projects", to: "/projects" },
  { label: "Sessions", to: "/sessions" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { data: viewer } = useCurrentUser();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/82 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link to="/" className="interactive-tab flex shrink-0 items-center gap-2.5 group">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden border border-primary/30 bg-black p-0.5 transition-all">
            <img src={mmmLogo} alt="MMM logo" className="h-full w-full object-contain" />
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-foreground">MMM</div>
        </Link>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center justify-center gap-1 md:flex">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`interactive-tab border px-3 py-2 text-[8px] uppercase tracking-[0.08em] leading-none transition-colors ${
                location.pathname === l.to
                  ? "border-primary/40 bg-primary/12 text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/70 hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden min-w-0 items-center justify-end gap-2 md:flex">
          {!viewer && (
            <Link to="/login">
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-[8px] text-muted-foreground hover:text-foreground">
                  Sign In
                </Button>
            </Link>
          )}
          {viewer && (
          <Link to="/account">
            <Button size="sm" className="btn-glow h-7 px-2.5 text-[7px] bg-primary text-primary-foreground hover:bg-primary/90">
              Account
            </Button>
          </Link>
          )}
        </div>

        <button className="md:hidden text-muted-foreground" onClick={() => setOpen(!open)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden border-t border-border/30"
          >
            <div className="p-4 space-y-2">
              {navLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="interactive-tab block border border-transparent px-4 py-3 text-[10px] uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:border-border hover:bg-secondary/50 hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
              <div className="pt-3 flex flex-col gap-2">
                {!viewer && (
                  <Link to="/login" onClick={() => setOpen(false)}>
                    <Button variant="outline" size="sm" className="w-full border-border/50">Sign In</Button>
                  </Link>
                )}
                {viewer && (
                <Link to="/account" onClick={() => setOpen(false)}>
                  <Button size="sm" className="w-full bg-primary text-primary-foreground">
                    Account
                  </Button>
                </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
