import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const Index = lazy(() => import("./pages/Index.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Leaderboard = lazy(() => import("./pages/Leaderboard.tsx"));
const Login = lazy(() => import("./pages/Login.tsx"));
const Milestones = lazy(() => import("./pages/Milestones.tsx"));
const PlayerDetail = lazy(() => import("./pages/PlayerDetail.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Projects = lazy(() => import("./pages/Projects.tsx"));
const PrivateServerDigs = lazy(() => import("./pages/PrivateServerDigs.tsx"));
const SSPHSPLeaderboard = lazy(() => import("./pages/SSPHSPLeaderboard.tsx"));
const Sessions = lazy(() => import("./pages/Sessions.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const SourceLeaderboard = lazy(() => import("./pages/SourceLeaderboard.tsx"));
const Submit = lazy(() => import("./pages/Submit.tsx"));
const AboutUs = lazy(() => import("./pages/AboutUs.tsx"));
const BetaAchievements = lazy(() => import("./pages/BetaAchievements.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container py-10">
        <div className="pixel-card border border-border p-6 font-pixel text-[10px] text-muted-foreground">
          LOADING PAGE
        </div>
      </div>
    </div>
  );
}

function RouteTitleSync() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = "MMM";

    if (path === "/dashboard") title = "MMM Dashboard";
    else if (path === "/account") title = "MMM Account";
    else if (path === "/leaderboard") title = "MMM Single Players";
    else if (path === "/leaderboard/private-server-digs") title = "MMM Private Server Digs";
    else if (path === "/leaderboard/ssp-hsp") title = "MMM SSP/HSP";
    else if (path === "/milestones") title = "MMM Milestones";
    else if (path.startsWith("/leaderboard/")) title = "MMM Source Leaderboard";
    else if (path === "/login") title = "MMM Connect";
    else if (path === "/profile") title = "MMM Profile";
    else if (path.startsWith("/player/")) title = "MMM Player Profile";
    else if (path === "/projects") title = "MMM Projects";
    else if (path === "/sessions") title = "MMM Sessions";
    else if (path === "/settings") title = "MMM Settings";
    else if (path === "/submit") title = "MMM Submit Updates";
    else if (path === "/achievements" || path === "/milestones") title = "MMM Achievements";
    else if (path === "/beta-achievements") title = "MMM Beta Achievements";
    else if (path === "/about") title = "MMM About Us";

    document.title = title;
  }, [location.pathname]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RouteTitleSync />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/account" element={<Account />} />
            <Route path="/features" element={<Navigate to="/" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/achievements" element={<Milestones />} />
            <Route path="/milestones" element={<Navigate to="/achievements" replace />} />
            <Route path="/leaderboard/digs-world" element={<Navigate to="/leaderboard/private-server-digs" replace />} />
            <Route path="/leaderboard/private-server-digs" element={<PrivateServerDigs />} />
            <Route path="/leaderboard/ssp-hsp" element={<SSPHSPLeaderboard />} />
            <Route path="/leaderboard/:slug" element={<SourceLeaderboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/player/:slug" element={<PlayerDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/submit" element={<Submit />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/beta-achievements" element={<BetaAchievements />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
