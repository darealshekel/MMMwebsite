import { Link, useLocation } from "react-router-dom";
import { Pickaxe, LayoutDashboard, FolderKanban, History, Settings, User, LogOut } from "lucide-react";

const sideLinks = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "Sessions", to: "/sessions", icon: History },
  { label: "Profile", to: "/profile", icon: User },
  { label: "Settings", to: "/settings", icon: Settings },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen pt-16">
      {/* Side nav */}
      <aside className="hidden lg:flex flex-col w-60 border-r border-border/40 bg-card/30 backdrop-blur-sm fixed top-16 bottom-0 left-0 z-40">
        <div className="flex-1 py-6 px-3 space-y-1">
          {sideLinks.map((l) => {
            const active = location.pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <l.icon className="w-4 h-4" />
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="p-3 border-t border-border/30">
          <Link to="/login" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
            <LogOut className="w-4 h-4" />
            Log Out
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 lg:ml-60 p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
