import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, LogOut, MessageCircle, ShieldCheck, XCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { GlassCard } from "@/components/GlassCard";
import { HeroBackground } from "@/components/HeroBackground";
import { SkeletonCard } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { signOutEverywhere, startDiscordSignIn } from "@/lib/browser-auth";
import { fetchMyMinecraftClaims, submitMinecraftClaim } from "@/lib/minecraft-claims";
import type { MinecraftClaimSummary } from "@/lib/types";

function ClaimStatusBadge({ status }: { status: MinecraftClaimSummary["status"] }) {
  if (status === "approved") {
    return <span className="inline-flex items-center gap-1 border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 font-pixel text-[8px] text-emerald-100"><CheckCircle2 className="h-3 w-3" /> APPROVED</span>;
  }
  if (status === "rejected") {
    return <span className="inline-flex items-center gap-1 border border-rose-300/30 bg-rose-300/10 px-2 py-1 font-pixel text-[8px] text-rose-100"><XCircle className="h-3 w-3" /> REJECTED</span>;
  }
  return <span className="inline-flex items-center gap-1 border border-primary/30 bg-primary/10 px-2 py-1 font-pixel text-[8px] text-primary"><Clock className="h-3 w-3" /> PENDING</span>;
}

function ClaimCard({ claim }: { claim: MinecraftClaimSummary }) {
  return (
    <div className="pixel-card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-pixel text-[10px] text-foreground">{claim.minecraftName}</div>
          <div className="mt-1 break-all text-[8px] leading-[1.7] text-muted-foreground">{claim.minecraftUuid}</div>
        </div>
        <ClaimStatusBadge status={claim.status} />
      </div>
      <div className="grid gap-2 text-[8px] leading-[1.7] text-muted-foreground sm:grid-cols-2">
        <div>Submitted: {new Date(claim.submittedAt).toLocaleString()}</div>
        <div>Input: {claim.submittedValue}</div>
      </div>
      {claim.status === "pending" && (
        <div className="border border-primary/20 bg-primary/10 p-3 text-[9px] leading-[1.7] text-primary">
          Pending admin or owner approval for this Minecraft profile.
        </div>
      )}
      {claim.status === "rejected" && (
        <div className="border border-rose-300/20 bg-rose-500/10 p-3 text-[9px] leading-[1.7] text-rose-100">
          {claim.rejectionReason || "Rejected without a reason. You can submit a corrected claim."}
        </div>
      )}
    </div>
  );
}

export default function Account() {
  const queryClient = useQueryClient();
  const { data: viewer, isLoading } = useCurrentUser();
  const [claimInput, setClaimInput] = useState("");

  const claimsQuery = useQuery({
    queryKey: ["minecraft-claims", "me"],
    queryFn: fetchMyMinecraftClaims,
    enabled: Boolean(viewer),
    staleTime: 2_000,
    retry: false,
  });

  const submitClaim = useMutation({
    mutationFn: submitMinecraftClaim,
    onSuccess: async () => {
      setClaimInput("");
      await queryClient.invalidateQueries({ queryKey: ["minecraft-claims", "me"] });
      toast.success("Minecraft claim submitted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const claims = claimsQuery.data?.claims ?? [];
  const hasApprovedClaim = claims.some((claim) => claim.status === "approved");
  const hasPendingClaim = claims.some((claim) => claim.status === "pending");

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <HeroBackground />
      <Navbar />
      <main className="container relative z-10 py-24">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-4xl space-y-5">
          <GlassCard glow="primary" className="p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="font-pixel text-[10px] uppercase tracking-[0.12em] text-primary">MMM ACCOUNT</div>
                <h1 className="font-pixel text-2xl text-foreground md:text-3xl">Account Claiming</h1>
                <p className="max-w-2xl text-[10px] leading-[1.9] text-muted-foreground">
                  Log in with Discord, submit your Minecraft username or UUID, then wait for an admin to approve the link.
                </p>
              </div>
              {viewer ? (
                <Button variant="outline" className="gap-2 border-border/60" onClick={() => signOutEverywhere()}>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              ) : null}
            </div>
          </GlassCard>

          {!viewer && !isLoading && (
            <GlassCard className="p-6">
              <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
                <div className="space-y-2">
                  <div className="font-pixel text-[12px] text-foreground">Login Required</div>
                  <p className="text-[10px] leading-[1.8] text-muted-foreground">
                    Discord login is required before you can submit a Minecraft profile claim.
                  </p>
                </div>
                <Button className="btn-glow gap-2 bg-[#5865F2] text-white hover:bg-[#4752C4]" onClick={() => void startDiscordSignIn("/account")}>
                  <MessageCircle className="h-4 w-4" />
                  Login with Discord
                </Button>
              </div>
            </GlassCard>
          )}

          {viewer && (
            <>
              <GlassCard className="p-6">
                <div className="grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
                  <img src={viewer.avatarUrl} alt={viewer.username} className="h-16 w-16 border border-primary/30 object-cover" />
                  <div className="space-y-1">
                    <div className="font-pixel text-[12px] text-foreground">{viewer.discordUsername ?? viewer.username}</div>
                    <div className="text-[9px] leading-[1.7] text-muted-foreground">
                      {viewer.discordId ? `Discord ID: ${viewer.discordId}` : `Provider: ${viewer.provider}`}
                    </div>
                    <div className="text-[9px] leading-[1.7] text-muted-foreground">Role: {(viewer.role ?? "user").toUpperCase()}</div>
                  </div>
                  {hasApprovedClaim ? (
                    <div className="inline-flex items-center gap-2 border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 font-pixel text-[8px] text-emerald-100">
                      <ShieldCheck className="h-4 w-4" />
                      MINECRAFT LINKED
                    </div>
                  ) : null}
                </div>
              </GlassCard>

              <GlassCard className="space-y-4 p-6">
                <div className="space-y-1">
                  <h2 className="font-pixel text-[14px] text-foreground">Minecraft Profile Claim</h2>
                  <p className="text-[9px] leading-[1.8] text-muted-foreground">
                    Enter your current Minecraft username or full UUID. Duplicate active claims are blocked automatically.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    value={claimInput}
                    onChange={(event) => setClaimInput(event.target.value)}
                    placeholder="Minecraft username or UUID"
                    className="font-pixel text-[10px]"
                    disabled={submitClaim.isPending || hasApprovedClaim || hasPendingClaim}
                  />
                  <Button
                    onClick={() => submitClaim.mutate(claimInput)}
                    disabled={submitClaim.isPending || !claimInput.trim() || hasApprovedClaim || hasPendingClaim}
                  >
                    Submit Claim
                  </Button>
                </div>
                {hasApprovedClaim && (
                  <div className="pixel-card p-3 text-[9px] leading-[1.8] text-muted-foreground">
                    This account already has an approved Minecraft link. Ask an admin to unlink or transfer it if needed.
                  </div>
                )}
                {hasPendingClaim && (
                  <div className="pixel-card p-3 text-[9px] leading-[1.8] text-muted-foreground">
                    Your pending claim must be reviewed before another active claim can be submitted.
                  </div>
                )}
              </GlassCard>

              <GlassCard className="space-y-4 p-6">
                <h2 className="font-pixel text-[14px] text-foreground">Claim Status</h2>
                {claimsQuery.isLoading ? (
                  <SkeletonCard lines={3} />
                ) : claimsQuery.error ? (
                  <div className="pixel-card border border-rose-400/20 bg-rose-500/10 p-4 text-[10px] text-rose-100">
                    {(claimsQuery.error as Error).message}
                  </div>
                ) : claims.length > 0 ? (
                  <div className="space-y-3">
                    {claims.map((claim) => <ClaimCard key={claim.id} claim={claim} />)}
                  </div>
                ) : (
                  <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO MINECRAFT CLAIMS SUBMITTED YET.</div>
                )}
              </GlassCard>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
