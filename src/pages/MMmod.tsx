import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Minus, X } from "lucide-react";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { useCurrentUser } from "@/hooks/use-current-user";

const DISCORD_URL = "https://discord.mmmaniacs.com/";

type ModalType = "supporter" | "supporterPlus" | "achievements" | null;

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

type FeatureRow = {
  name: string;
  free: boolean;
  plus: boolean;
  premium: boolean;
};

const features: FeatureRow[] = [
  { name: "Basic block counter", free: true, plus: true, premium: true },
  { name: "Session tracking", free: true, plus: true, premium: true },
  { name: "Website leaderboard sync", free: true, plus: true, premium: true },
  { name: "Milestone notifications", free: true, plus: true, premium: true },
  { name: "Live BPH Tracker Overlay", free: false, plus: true, premium: true },
  { name: "Session Pace Indicator", free: false, plus: true, premium: true },
  { name: "Milestone ETA", free: false, plus: true, premium: true },
  { name: "Mining Heatmap", free: false, plus: true, premium: true },
  { name: "Milestone popups", free: false, plus: true, premium: true },
  { name: "Session comparisons", free: false, plus: true, premium: true },
  { name: "Daily / Weekly charts", free: false, plus: true, premium: true },
  { name: "Top Sessions Leaderboard", free: false, plus: true, premium: true },
  { name: "Friend comparisons", free: false, plus: true, premium: true },
  { name: "Favourite block selection", free: false, plus: true, premium: true },
  { name: "Fatigue detection", free: false, plus: true, premium: true },
  { name: "Adaptive Coaching Overlay", free: false, plus: false, premium: true },
  { name: "Auto Sessions Analysis", free: false, plus: false, premium: true },
  { name: "Personal Record Tracker", free: false, plus: false, premium: true },
  { name: "Dynamic HUD", free: false, plus: false, premium: true },
  { name: "Customizable UI themes", free: false, plus: false, premium: true },
  { name: "Overdrive Mode", free: false, plus: false, premium: true },
  { name: "Block-type breakdowns", free: false, plus: false, premium: true },
  { name: "Efficiency per depth", free: false, plus: false, premium: true },
  { name: "Mining Patterns", free: false, plus: false, premium: true },
  { name: "Long-term improvement graphs", free: false, plus: false, premium: true },
  { name: "Rival System", free: false, plus: false, premium: true },
  { name: "Smart Sessions planner", free: false, plus: false, premium: true },
];

const supporterFeatures = features.filter((f) => !f.free && f.plus);
const supporterPlusFeatures = features.filter((f) => !f.plus && f.premium);

const modHighlights = [
  { label: "Real-time tracking", desc: "Every block counted as you mine, zero delay." },
  { label: "Website sync", desc: "Your stats appear on the MMM leaderboard automatically via MMMod." },
  { label: "Session analytics", desc: "Review your past sessions with charts and pace data." },
  { label: "Milestone system", desc: "Get notified the moment you hit a new record." },
  { label: "Overlay HUD", desc: "Live BPH and pace indicators on your screen while you play." },
  { label: "Friend leaderboard", desc: "See how your sessions stack up against your friends." },
];

type AchievementReward = {
  achievement: string;
  reward: string;
  duration: string;
  tier: "supporter" | "supporterPlus";
  note?: string;
};

const achievementRewards: AchievementReward[] = [
  { achievement: "Yearly Champion", reward: "Supporter Plus", duration: "until next year", tier: "supporterPlus" },
  { achievement: "Yearly Podium #2 / #3", reward: "Supporter Plus", duration: "until next year", tier: "supporterPlus" },
  { achievement: "Yearly Elite", reward: "Supporter", duration: "until next year", tier: "supporter" },
  { achievement: "Part of the Mod", reward: "Supporter Plus", duration: "for 6 months", tier: "supporterPlus" },
  { achievement: "No Life", reward: "Supporter", duration: "for 6 months", tier: "supporter" },
  { achievement: "Eternal Miner", reward: "Supporter Plus", duration: "for 1 month", tier: "supporterPlus", note: "Once per year" },
  { achievement: "Unstoppable", reward: "Supporter", duration: "for 1 month", tier: "supporter", note: "Once per year" },
  { achievement: "Singular Obsession", reward: "Supporter Plus", duration: "for 1 month", tier: "supporterPlus" },
  { achievement: "A Focused One Indeed", reward: "Supporter", duration: "for 1 month", tier: "supporter" },
  { achievement: "50M Digs", reward: "Supporter", duration: "for 1 month", tier: "supporter" },
  { achievement: "100M Digs", reward: "Supporter", duration: "for 2 months", tier: "supporter" },
  { achievement: "150M Digs", reward: "Supporter", duration: "for 3 months", tier: "supporter" },
  { achievement: "200M Digs", reward: "Supporter", duration: "for 6 months", tier: "supporter" },
  { achievement: "250M Digs", reward: "Supporter Plus", duration: "for 2 months", tier: "supporterPlus" },
  { achievement: "300M Digs", reward: "Supporter Plus", duration: "for 2 months", tier: "supporterPlus" },
  { achievement: "350M Digs", reward: "Supporter Plus", duration: "for 2 months", tier: "supporterPlus" },
  { achievement: "400M Digs", reward: "Supporter Plus", duration: "for 2 months", tier: "supporterPlus" },
  { achievement: "450M Digs", reward: "Supporter Plus", duration: "for 2 months", tier: "supporterPlus" },
  { achievement: "500M Digs", reward: "Supporter Plus", duration: "for 6 months", tier: "supporterPlus" },
];

function Cell({ value }: { value: boolean }) {
  return value ? (
    <Check className="mx-auto h-4 w-4 text-primary" />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
  );
}

function TierBadge({ tier, size = "sm" }: { tier: "supporter" | "supporterPlus"; size?: "sm" | "md" }) {
  const px = size === "md" ? "px-2.5 py-1" : "px-2 py-0.5";
  const text = size === "md" ? "text-[9px]" : "text-[7px]";
  if (tier === "supporterPlus") {
    return (
      <span className={`font-pixel uppercase tracking-[0.1em] text-gold-shimmer border border-yellow-600/40 bg-yellow-500/10 ${px} ${text}`}>
        Supporter Plus
      </span>
    );
  }
  return (
    <span className={`font-pixel uppercase tracking-[0.1em] text-diamond-blue border border-cyan-500/40 bg-cyan-500/10 ${px} ${text}`}>
      Supporter
    </span>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.22 }}
        className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto border border-border bg-background p-6"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </motion.div>
    </div>
  );
}

// PayPal SDK singleton loader
let _sdkPromise: Promise<void> | null = null;
function loadPayPalSdk(clientId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).paypal) return Promise.resolve();
  if (_sdkPromise) return _sdkPromise;
  _sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription&currency=USD&components=buttons`;
    script.onload = () => resolve();
    script.onerror = () => { _sdkPromise = null; reject(new Error("Failed to load payment SDK.")); };
    document.head.appendChild(script);
  });
  return _sdkPromise;
}

type PlanData = { clientId: string; plans: Record<string, string> };

function PayPalButtonsPanel({
  planId,
  planKey,
  csrfToken,
  creatorCodeRef,
  onError,
}: {
  planId: string;
  planKey: string;
  csrfToken: string;
  creatorCodeRef: { current: string };
  onError: (msg: string) => void;
}) {
  const id = `paypal-btn-${planKey}`;
  useEffect(() => {
    const container = document.getElementById(id);
    if (!container || container.childElementCount > 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).paypal.Buttons({
      style: { shape: "rect", color: "black", layout: "vertical", label: "subscribe" },
      createSubscription: (_: unknown, actions: { subscription: { create: (o: { plan_id: string }) => Promise<string> } }) =>
        actions.subscription.create({ plan_id: planId }),
      onApprove: async (data: { subscriptionID: string }) => {
        const csrf = getCsrfToken();
        const res = await fetch("/api/paypal/record-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf ?? "" },
          body: JSON.stringify({
            subscriptionId: data.subscriptionID,
            planKey,
            creatorCode: creatorCodeRef.current.trim() || null,
          }),
        });
        const result = (await res.json()) as { success?: boolean; error?: string };
        if (res.ok && result.success) {
          window.location.href = `/subscription/success?planKey=${planKey}`;
        } else {
          onError(result.error ?? "Failed to record subscription.");
        }
      },
      onError: () => onError("Payment failed. Please try again."),
      onCancel: () => {},
    }).render(`#${id}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div id={id} className="w-full min-h-[55px]" />;
}

function getCsrfToken() {
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("aetweaks_csrf="))
    ?.split("=")[1] ?? null;
}

function PricingModal({ tier, onClose }: { tier: "supporter" | "supporterPlus"; onClose: () => void }) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [creatorCode, setCreatorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const creatorCodeRef = useRef(creatorCode);
  creatorCodeRef.current = creatorCode;

  const { data: currentUser } = useCurrentUser();
  const isAuthenticated = currentUser != null;

  const isPlus = tier === "supporterPlus";
  const name = isPlus ? "Supporter Plus" : "Supporter";
  const monthly = isPlus ? "$4.99" : "$2.99";
  const yearly = isPlus ? "$49.99" : "$29.99";
  const monthlyNum = isPlus ? 4.99 : 2.99;
  const saving = ((monthlyNum * 12) - (isPlus ? 49.99 : 29.99)).toFixed(2);
  const planKey = isPlus
    ? (billing === "monthly" ? "supporter_plus_monthly" : "supporter_plus_yearly")
    : (billing === "monthly" ? "supporter_monthly" : "supporter_yearly");
  const planId = planData?.plans[planKey];

  useEffect(() => {
    fetch("/api/paypal/plans")
      .then((r) => r.json())
      .then((data: PlanData) => {
        setPlanData(data);
        return loadPayPalSdk(data.clientId);
      })
      .then(() => setSdkReady(true))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <ModalShell onClose={onClose}>
      <div className="space-y-5">
        <div className="space-y-1 pr-6">
          <div className={`font-pixel text-[10px] uppercase tracking-[0.14em] ${isPlus ? "text-gold-shimmer" : "text-diamond-blue"}`}>{name}</div>
          <h2 className="font-pixel text-xl text-foreground">Choose your billing</h2>
        </div>

        {/* Billing toggle */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`flex flex-col overflow-hidden border font-pixel text-[9px] transition-colors ${
              billing === "monthly"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <div className="w-full py-1 opacity-0 select-none text-[7px]">_</div>
            <div className="flex flex-col items-center justify-center px-4 py-3">
              <div className="font-pixel text-[18px] leading-none mb-1">{monthly}<span className="text-[8px]">/mo</span></div>
              <div>MONTHLY</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setBilling("yearly")}
            className={`flex flex-col overflow-hidden border font-pixel text-[9px] transition-colors ${
              billing === "yearly"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <div className={`w-full py-1 text-center font-pixel text-[7px] tracking-[0.12em] ${
              billing === "yearly" ? "bg-primary text-background" : "bg-primary/15 text-primary/70"
            }`}>
              2 MONTHS FREE
            </div>
            <div className="flex flex-col items-center justify-center px-4 py-3">
              <div className="font-pixel text-[18px] leading-none mb-1">{yearly}<span className="text-[8px]">/yr</span></div>
              <div>YEARLY</div>
              {billing === "yearly" && <div className="mt-0.5 font-pixel text-[7px] text-primary/60">Save ${saving}</div>}
            </div>
          </button>
        </div>

        {/* Features */}
        {isPlus && (
          <div className="space-y-2">
            <div className="font-pixel text-[8px] uppercase tracking-[0.12em] text-diamond-blue">Everything in Supporter</div>
            <ul className="space-y-1.5">
              {supporterFeatures.map((f) => (
                <li key={f.name} className="flex items-center gap-2 font-pixel text-[9px] text-foreground/70">
                  <Check className="h-3 w-3 shrink-0 text-diamond-blue" />
                  {f.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-2">
          <div className={`font-pixel text-[8px] uppercase tracking-[0.12em] ${isPlus ? "text-gold-shimmer" : "text-diamond-blue"}`}>
            {isPlus ? "Exclusive to Supporter Plus" : "Unlocked with Supporter"}
          </div>
          <ul className="space-y-1.5">
            {(isPlus ? supporterPlusFeatures : supporterFeatures).map((f) => (
              <li key={f.name} className="flex items-center gap-2 font-pixel text-[9px] text-foreground">
                <Check className={`h-3 w-3 shrink-0 ${isPlus ? "text-gold-shimmer" : "text-diamond-blue"}`} />
                {f.name}
              </li>
            ))}
          </ul>
        </div>

        {/* Creator code */}
        <div className="space-y-1.5">
          <div className="font-pixel text-[8px] uppercase tracking-[0.12em] text-muted-foreground">Creator Code (optional)</div>
          <input
            type="text"
            value={creatorCode}
            onChange={(e) => setCreatorCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            maxLength={32}
            className="w-full border border-border/60 bg-background px-3 py-2 font-pixel text-[9px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
          />
        </div>

        {error && <div className="font-pixel text-[8px] text-red-400">{error}</div>}

        {/* Payment buttons */}
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={() => { window.location.href = "/login"; }}
            className="btn-glow flex w-full items-center justify-center border border-primary/40 bg-primary/10 px-4 py-3 font-pixel text-[9px] text-primary transition-colors hover:bg-primary/20"
          >
            LOG IN TO SUBSCRIBE
          </button>
        ) : sdkReady && planId ? (
          <PayPalButtonsPanel
            key={planKey}
            planId={planId}
            planKey={planKey}
            csrfToken={getCsrfToken() ?? ""}
            creatorCodeRef={creatorCodeRef}
            onError={setError}
          />
        ) : (
          <div className="flex items-center justify-center py-5">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        <p className="font-pixel text-[7px] leading-[1.7] text-muted-foreground/70">
          Cancel anytime. PayPal and card payments accepted.
        </p>
      </div>
    </ModalShell>
  );
}

function AchievementsModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <div className="space-y-5">
        <div className="space-y-1 pr-6">
          <div className="font-pixel text-[8px] uppercase tracking-[0.14em] text-primary">ACHIEVEMENT REWARDS</div>
          <h2 className="font-pixel text-xl text-foreground">Subscription rewards</h2>
          <p className="font-pixel text-[8px] leading-[1.7] text-muted-foreground">
            Unlock achievements in-game to earn free subscription time. Contact us on Discord to claim.
          </p>
        </div>

        <div className="space-y-0">
          {achievementRewards.map((r) => (
            <div key={r.achievement} className="flex items-start justify-between gap-3 border-b border-border/30 py-2.5 last:border-0">
              <div className="min-w-0">
                <div className="font-pixel text-[9px] text-foreground">{r.achievement}</div>
                {r.note && (
                  <div className="mt-0.5 font-pixel text-[7px] text-muted-foreground/60">{r.note}</div>
                )}
              </div>
              <div className="shrink-0 text-right">
                {r.tier === "supporterPlus" ? (
                  <div className="font-pixel text-[8px] text-gold-shimmer uppercase">{r.reward}</div>
                ) : (
                  <div className="font-pixel text-[8px] text-diamond-blue uppercase">{r.reward}</div>
                )}
                <div className="font-pixel text-[7px] text-muted-foreground">{r.duration}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="font-pixel text-[8px] uppercase tracking-[0.12em] text-muted-foreground">CONDITIONS</div>
          <ul className="space-y-1.5 font-pixel text-[8px] leading-[1.7] text-muted-foreground">
            <li>— If you already have an active subscription, the reward value is deducted from your next payment.</li>
            <li>— If you hold 2 or more eligible achievements, rewards are additive. Supporter Plus is always applied first. If Supporter is already active and Supporter Plus is granted, it overrides until Supporter Plus expires.</li>
          </ul>
        </div>

        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block border border-border/60 px-4 py-3 text-center font-pixel text-[9px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          CLAIM ON DISCORD
        </a>
      </div>
    </ModalShell>
  );
}

export default function MMmod() {
  const [modal, setModal] = useState<ModalType>(null);

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <AnimatePresence>
        {modal === "supporter" && (
          <PricingModal key="supporter" tier="supporter" onClose={() => setModal(null)} />
        )}
        {modal === "supporterPlus" && (
          <PricingModal key="supporterPlus" tier="supporterPlus" onClose={() => setModal(null)} />
        )}
        {modal === "achievements" && (
          <AchievementsModal key="achievements" onClose={() => setModal(null)} />
        )}
      </AnimatePresence>

      {/* Hero */}
      <section className="relative overflow-hidden grid-bg border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/10 to-background" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="container relative z-10 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-5"
          >
            <div className="inline-flex items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
              <span className="font-pixel text-[9px]">MMMOD</span>
            </div>
            <h1 className="font-pixel text-4xl leading-tight text-foreground md:text-5xl">
              Track Every Block<br />You Mine
              <span className="text-primary animate-blink">_</span>
            </h1>
            <p className="mx-auto max-w-2xl font-display text-2xl leading-snug text-foreground/70">
              MMMod records your mining sessions, syncs your stats to the MMM website, and gives you real-time analytics while you play.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-glow border border-primary/40 bg-primary/10 px-6 py-3 font-pixel text-[9px] text-primary transition-colors hover:bg-primary/20"
              >
                GET THE MOD
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <main className="container space-y-0 divide-y divide-border">

        {/* Features */}
        <section className="py-16">
          <div className="mb-10 text-center">
            <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary mb-2">FEATURES</div>
            <h2 className="font-pixel text-2xl text-foreground">What MMMod does</h2>
          </div>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {modHighlights.map((item) => (
              <motion.div key={item.label} variants={fadeUp} transition={{ duration: 0.35 }}>
                <GlassCard className="h-full p-5 space-y-2">
                  <div className="font-pixel text-[10px] text-primary uppercase tracking-[0.1em]">{item.label}</div>
                  <p className="text-[9px] leading-[1.8] text-muted-foreground">{item.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Pricing */}
        <section className="py-16">
          <div className="mb-10 text-center">
            <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary mb-2">PRICING</div>
            <h2 className="font-pixel text-2xl text-foreground">Plans</h2>
          </div>
          <div className="grid items-stretch gap-5 md:grid-cols-3">

            {/* Free */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              transition={{ duration: 0.35 }}
              className="h-full"
            >
              <GlassCard className="flex h-full flex-col overflow-hidden">
                <div className="px-6 pt-6 pb-4 space-y-3">
                  <div className="font-pixel text-[11px] uppercase tracking-[0.12em] text-muted-foreground">FREE</div>
                  <div>
                    <div className="font-pixel text-4xl text-foreground">$0</div>
                    <div className="font-pixel text-[8px] text-muted-foreground mt-1">forever</div>
                  </div>
                  <p className="text-[9px] leading-[1.8] text-muted-foreground">
                    Core tracking and leaderboard sync. Everything you need to get started.
                  </p>
                </div>
                <div className="flex-1" />
                <div className="px-6 pb-6">
                  <a
                    href={DISCORD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block border border-border/60 px-4 py-2.5 text-center font-pixel text-[9px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    DOWNLOAD
                  </a>
                </div>
              </GlassCard>
            </motion.div>

            {/* Supporter */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.08 }}
              className="h-full"
            >
              <GlassCard glow="primary" className="flex h-full flex-col overflow-hidden border-primary/40">
                {/* Top badge */}
                <div className="bg-primary px-6 py-2 text-center font-pixel text-[8px] tracking-[0.15em] text-primary-foreground">
                  ★ MOST POPULAR ★
                </div>
                <div className="px-6 pt-5 pb-4 space-y-3">
                  <div className="font-pixel text-[13px] uppercase tracking-[0.1em] text-diamond-blue">SUPPORTER</div>
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <div className="font-pixel text-4xl text-foreground">$2.50</div>
                      <div className="font-pixel text-[9px] text-muted-foreground">/mo</div>
                    </div>
                    <div className="font-pixel text-[7px] text-muted-foreground mt-1">billed $29.99/year · click for options</div>
                  </div>
                  <p className="text-[9px] leading-[1.8] text-muted-foreground">
                    Live overlays, session analytics, friend leaderboards, and detailed charts.
                  </p>
                </div>
                <div className="px-6 pb-6">
                  <button
                    type="button"
                    onClick={() => setModal("supporter")}
                    className="btn-glow block w-full border border-primary/40 bg-primary/10 px-4 py-2.5 text-center font-pixel text-[9px] text-primary transition-colors hover:bg-primary/20"
                  >
                    GET SUPPORTER
                  </button>
                </div>
                <div className="flex-1" />
              </GlassCard>
            </motion.div>

            {/* Supporter Plus */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.16 }}
              className="h-full"
            >
              <GlassCard className="flex h-full flex-col overflow-hidden">
                {/* Top badge */}
                <div
                  className="px-6 py-2 text-center font-pixel text-[8px] tracking-[0.15em]"
                  style={{ background: "linear-gradient(90deg, #7a5200, #B8860B, #FFD700, #FFE566, #FFD700, #B8860B, #7a5200)", backgroundSize: "200% auto", color: "#000", animation: "shimmer 10s linear infinite" }}
                >
                  ★ BEST VALUE ★
                </div>
                <div className="px-6 pt-5 pb-4 space-y-3">
                  <div className="font-pixel text-[13px] uppercase tracking-[0.1em] text-gold-shimmer">SUPPORTER PLUS</div>
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <div className="font-pixel text-4xl text-foreground">$4.17</div>
                      <div className="font-pixel text-[9px] text-muted-foreground">/mo</div>
                    </div>
                    <div className="font-pixel text-[7px] text-muted-foreground mt-1">billed $49.99/year · click for options</div>
                  </div>
                  <p className="text-[9px] leading-[1.8] text-muted-foreground">
                    Everything in Supporter, plus adaptive coaching, custom HUD, rival system, and full mining pattern analysis.
                  </p>
                </div>
                <div className="flex-1" />
                <div className="px-6 pb-6">
                  <button
                    type="button"
                    onClick={() => setModal("supporterPlus")}
                    className="block w-full border border-yellow-600/40 bg-yellow-500/10 px-4 py-2.5 text-center font-pixel text-[9px] text-gold-shimmer transition-colors hover:bg-yellow-500/15"
                  >
                    GET SUPPORTER PLUS
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="py-16">
          <div className="mb-10 text-center">
            <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary mb-2">COMPARE</div>
            <h2 className="font-pixel text-2xl text-foreground">Feature comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-6 text-left font-pixel text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Feature</th>
                  <th className="px-4 py-3 text-center font-pixel text-[9px] uppercase tracking-[0.1em] text-muted-foreground border-r-2 border-r-border/60">Free</th>
                  <th className="px-4 py-3 text-center font-pixel text-[9px] uppercase tracking-[0.1em] border-r border-r-yellow-600/20 bg-cyan-500/[0.04]">
                    <span className="text-diamond-blue">Supporter</span>
                  </th>
                  <th className="px-4 py-3 text-center font-pixel text-[9px] uppercase tracking-[0.1em] bg-yellow-500/[0.03]">
                    <span className="text-gold-shimmer">Supporter Plus</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((row, i) => (
                  <tr key={row.name} className={`border-b border-border/40 ${i % 2 === 0 ? "" : "bg-primary/[0.015]"}`}>
                    <td className="py-2.5 pr-6 font-pixel text-[9px] leading-[1.6] text-foreground">{row.name}</td>
                    <td className="px-4 py-2.5 text-center border-r-2 border-r-border/60"><Cell value={row.free} /></td>
                    <td className="px-4 py-2.5 text-center border-r border-r-yellow-600/20 bg-cyan-500/[0.04]"><Cell value={row.plus} /></td>
                    <td className="px-4 py-2.5 text-center bg-yellow-500/[0.03]"><Cell value={row.premium} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Achievement rewards CTA */}
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={() => setModal("achievements")}
              className="btn-glow border border-primary/40 bg-primary/10 px-6 py-3 font-pixel text-[9px] text-primary transition-colors hover:bg-primary/20"
            >
              FREE ACHIEVEMENT REWARDS
            </button>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
