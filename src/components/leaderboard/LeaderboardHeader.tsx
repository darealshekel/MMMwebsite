import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Menu, UserRound, X } from "lucide-react";
import mmmNavLogo from "@/assets/mmm-nav-logo.png";
import { useCurrentUser } from "@/hooks/use-current-user";
import { signOutEverywhere } from "@/lib/browser-auth";

const links = [
  { label: "Leaderboard", to: "/leaderboard" },
  { label: "Achievements", to: "/achievements" },
  { label: "Submit", to: "/submit" },
  { label: "Mod", to: "/mmmod" },
  { label: "About", to: "/about" },
];

function roleLabel(role: string | null | undefined, isAdmin?: boolean) {
  const normalized = String(role ?? "").toLowerCase();
  if (normalized === "owner") return "Owner";
  if (normalized === "admin" || isAdmin) return "Admin";
  return "Player";
}

function HeaderProfileBlock({ viewer }: { viewer: NonNullable<ReturnType<typeof useCurrentUser>["data"]> }) {
  const logout = async () => {
    await signOutEverywhere();
  };

  return (
    <div className="flex min-w-0 max-w-[min(15.5rem,calc(100vw-8.25rem))] items-center text-left sm:max-w-[17rem]">
      <Link to="/dashboard" className="flex min-w-0 flex-1 items-center gap-2 py-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
          {viewer.avatarUrl ? (
            <img src={viewer.avatarUrl} alt={`${viewer.username} avatar`} className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-pixel text-[8px] uppercase leading-[1.4] tracking-[0.06em] text-foreground sm:text-[9px]">
            {viewer.username}
          </div>
          <div className="truncate font-pixel text-[7px] uppercase leading-[1.4] tracking-[0.08em] text-muted-foreground">
            {roleLabel(viewer.role, viewer.isAdmin)}
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={logout}
        className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary/70 hover:text-foreground"
        aria-label="Log out"
        title="Log out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function LeaderboardHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { data: viewer } = useCurrentUser();

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
                : l.to === "/achievements"
                  ? location.pathname === "/achievements" || location.pathname === "/milestones"
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

        <div className="z-10 flex min-w-0 items-center justify-self-end gap-2">
          <div className="hidden md:flex">
            {viewer ? (
              <HeaderProfileBlock viewer={viewer} />
            ) : (
              <Link
                to="/login"
                className="group relative px-3 py-2.5 font-pixel text-[9px] bg-primary text-primary-foreground transition-all hover:bg-primary/90 hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_hsl(0_0%_0%)] shadow-[4px_4px_0_0_hsl(0_0%_0%)]"
              >
                LOG IN
              </Link>
            )}
          </div>
          <button className="md:hidden text-muted-foreground" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden border-t border-border/30"
          >
            <div className="container py-4 space-y-1">
              {links.map((l) => {
                const active =
                  l.to === "/leaderboard"
                    ? location.pathname === "/leaderboard" || location.pathname.startsWith("/leaderboard/")
                    : l.to === "/achievements"
                      ? location.pathname === "/achievements" || location.pathname === "/milestones"
                    : location.pathname === l.to || (l.to !== "/" && location.pathname.startsWith(`${l.to}/`));
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className={`block border px-4 py-3 font-pixel text-[10px] uppercase tracking-[0.06em] transition-colors ${
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/50 hover:text-foreground"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
              <div className="pt-2">
                {viewer ? (
                  <div className="flex items-center gap-3 px-4 py-2">
                    {viewer.avatarUrl && <img src={viewer.avatarUrl} alt={viewer.username} className="h-7 w-7 object-cover" />}
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-pixel text-[9px] uppercase text-foreground">{viewer.username}</div>
                    </div>
                    <button type="button" onClick={() => { setOpen(false); void signOutEverywhere(); }} className="text-muted-foreground hover:text-foreground">
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="block border border-primary/40 bg-primary/10 px-4 py-3 text-center font-pixel text-[10px] uppercase tracking-[0.06em] text-primary"
                  >
                    LOG IN
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
