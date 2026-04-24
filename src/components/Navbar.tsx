import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, UserRound, X } from "lucide-react";
import mmmLogo from "@/assets/mmm-logo.png";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { signOutEverywhere } from "@/lib/browser-auth";

const navLinks = [
  { label: "Features", to: "/features" },
  { label: "Account", to: "/account" },
  { label: "Leaderboard", to: "/leaderboard" },
  { label: "Milestones", to: "/milestones" },
  { label: "Submit", to: "/submit" },
  { label: "Projects", to: "/projects" },
  { label: "Sessions", to: "/sessions" },
];

function roleLabel(role: string | null | undefined, isAdmin?: boolean) {
  const normalized = String(role ?? "").toLowerCase();
  if (normalized === "owner") return "Owner";
  if (normalized === "admin" || isAdmin) return "Admin";
  return "Player";
}

function UserProfileBlock({
  viewer,
  onNavigate,
  compact = false,
}: {
  viewer: NonNullable<ReturnType<typeof useCurrentUser>["data"]>;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const logout = async () => {
    onNavigate?.();
    await signOutEverywhere();
  };
  const label = roleLabel(viewer.role, viewer.isAdmin);

  return (
    <div className={`flex min-w-0 items-center text-left ${compact ? "w-full px-1 py-2" : "h-9 max-w-[260px]"}`}>
      <Link to="/dashboard" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden">
          {viewer.avatarUrl ? (
            <img src={viewer.avatarUrl} alt={`${viewer.username} avatar`} className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-pixel text-[8px] uppercase leading-[1.15] tracking-[0.06em] text-foreground">{viewer.username}</div>
          <div className="mt-0.5 translate-y-px truncate font-pixel text-[7px] uppercase leading-[1.25] tracking-[0.08em] text-muted-foreground">{label}</div>
        </div>
      </Link>
      <button
        type="button"
        onClick={logout}
        className="interactive-tab ml-3 flex h-8 shrink-0 items-center justify-center border border-transparent px-2 font-pixel text-[8px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-border hover:bg-secondary/70 hover:text-foreground"
        aria-label="Log out"
        title="Log out"
      >
        Log out
      </button>
    </div>
  );
}

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

        <div className="ml-auto hidden min-w-[168px] items-center justify-end gap-2 md:flex">
          {!viewer && (
            <Link to="/login">
                <Button variant="ghost" size="sm" className="interactive-tab h-8 border border-transparent px-3 font-pixel text-[8px] uppercase tracking-[0.08em] text-muted-foreground hover:border-border hover:bg-secondary/70 hover:text-foreground">
                  Log in
                </Button>
            </Link>
          )}
          {viewer && <UserProfileBlock viewer={viewer} />}
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
                    <Button variant="outline" size="sm" className="w-full border-border/50 font-pixel text-[9px] uppercase tracking-[0.08em]">Log in</Button>
                  </Link>
                )}
                {viewer && <UserProfileBlock viewer={viewer} onNavigate={() => setOpen(false)} compact />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
