import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ShieldCheck } from "lucide-react";
import aeLogo from "@/assets/ae-logo.png";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";

const navLinks = [
  { label: "Features", to: "/features" },
  { label: "Dashboard", to: "/dashboard" },
  { label: "Leaderboard", to: "/leaderboard" },
  { label: "Projects", to: "/projects" },
  { label: "Sessions", to: "/sessions" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { data: viewer } = useCurrentUser();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel-strong border-b border-border/40">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:glow-primary transition-all">
            <img src={aeLogo} alt="Ae logo" className="h-5 w-5 object-contain" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            Ae<span className="text-primary">Tweaks</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === l.to
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          {viewer ? (
            <Link to="/profile" className="flex items-center gap-2 rounded-full border border-border/40 bg-secondary/40 px-3 py-1.5 text-sm text-foreground">
              <img src={viewer.avatarUrl} alt={viewer.username} className="h-7 w-7 rounded-md" />
              <span>{viewer.username}</span>
            </Link>
          ) : (
            <Link to="/login">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Sign In
              </Button>
            </Link>
          )}
          {viewer && (
          <Link to="/dashboard">
            <Button size="sm" className="btn-glow bg-primary text-primary-foreground hover:bg-primary/90">
              Your Dashboard
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
                  className="block px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  {l.label}
                </Link>
              ))}
              <div className="pt-3 flex flex-col gap-2">
                {viewer ? (
                  <Link to="/profile" onClick={() => setOpen(false)}>
                    <Button variant="outline" size="sm" className="w-full border-border/50 gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      {viewer.username}
                    </Button>
                  </Link>
                ) : (
                  <Link to="/login" onClick={() => setOpen(false)}>
                    <Button variant="outline" size="sm" className="w-full border-border/50">Sign In</Button>
                  </Link>
                )}
                {viewer && (
                <Link to="/dashboard" onClick={() => setOpen(false)}>
                  <Button size="sm" className="w-full bg-primary text-primary-foreground">
                    Your Dashboard
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
