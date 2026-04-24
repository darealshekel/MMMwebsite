import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileImage, LockKeyhole, Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import { AuthRequiredState } from "@/components/AuthRequiredState";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { fetchSubmitPageData, submitMiningUpdate } from "@/lib/submissions";
import type { SubmitEditableSourceSummary } from "@/lib/types";

const proofTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function isValidProof(file: File | null) {
  return Boolean(file && proofTypes.has(file.type));
}

function parseBlocks(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 && Number.isInteger(parsed) ? parsed : null;
}

function parsePositiveBlocks(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 && Number.isInteger(parsed) ? parsed : null;
}

function isServerSourceType(value: string) {
  return value === "private-server" || value === "server";
}

function ProofPicker({
  proof,
  previewUrl,
  onProofChange,
}: {
  proof: File | null;
  previewUrl: string | null;
  onProofChange: (file: File | null) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground">Image Proof</Label>
      <label className="group flex cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-border bg-card/60 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
        <FileImage className="h-6 w-6 text-primary" />
        <div>
          <div className="font-pixel text-[10px] text-foreground">{proof ? proof.name : "Upload PNG, JPG, JPEG, or WEBP"}</div>
          <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">Required for every submission. Max 2.5 MB.</div>
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => onProofChange(event.target.files?.[0] ?? null)}
        />
      </label>
      {proof && !isValidProof(proof) ? (
        <div className="border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[9px] text-rose-100">
          Proof must be png, jpg, jpeg, or webp.
        </div>
      ) : null}
      {previewUrl ? (
        <div className="overflow-hidden border border-border bg-background/60">
          <img src={previewUrl} alt="Submission proof preview" className="max-h-64 w-full object-contain" />
        </div>
      ) : null}
    </div>
  );
}

function SourceOption({ source }: { source: SubmitEditableSourceSummary }) {
  return (
    <div className="flex items-center gap-3">
      {source.logoUrl ? <img src={source.logoUrl} alt={`${source.sourceName} logo`} className="h-7 w-7 object-contain" /> : null}
      <div className="min-w-0">
        <div className="truncate font-pixel text-[10px] text-foreground">{source.sourceName}</div>
        <div className="mt-1 text-[8px] text-muted-foreground">
          #{source.rank} - {source.currentBlocks.toLocaleString()} blocks
        </div>
      </div>
    </div>
  );
}

export default function Submit() {
  const queryClient = useQueryClient();
  const { data: viewer, isLoading: isAuthLoading } = useCurrentUser();
  const isLoggedIn = Boolean(viewer);
  const isLinked = Boolean(viewer?.minecraftUuidHash);

  const submitQuery = useQuery({
    queryKey: ["submit-page-data"],
    queryFn: fetchSubmitPageData,
    enabled: isLoggedIn && isLinked,
    staleTime: 2_000,
    retry: false,
  });

  const sources = useMemo(() => submitQuery.data?.existingSources ?? [], [submitQuery.data?.existingSources]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const selectedSource = sources.find((source) => source.sourceId === selectedSourceId) ?? null;

  const [editBlocks, setEditBlocks] = useState("");
  const [editProof, setEditProof] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);

  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceType, setNewSourceType] = useState("private-server");
  const [newSourceBlocks, setNewSourceBlocks] = useState("");
  const [newSourcePlayerRows, setNewSourcePlayerRows] = useState<Array<{ username: string; blocksMined: string }>>([
    { username: viewer?.username ?? "", blocksMined: "" },
  ]);
  const [newSourceProof, setNewSourceProof] = useState<File | null>(null);
  const [newSourcePreview, setNewSourcePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSource && sources[0]) {
      setSelectedSourceId(sources[0].sourceId);
    }
  }, [selectedSource, sources]);

  useEffect(() => {
    setEditBlocks(selectedSource ? String(selectedSource.currentBlocks) : "");
  }, [selectedSource]);

  useEffect(() => {
    if (!editProof) {
      setEditPreview(null);
      return;
    }
    const url = URL.createObjectURL(editProof);
    setEditPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [editProof]);

  useEffect(() => {
    if (!newSourceProof) {
      setNewSourcePreview(null);
      return;
    }
    const url = URL.createObjectURL(newSourceProof);
    setNewSourcePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newSourceProof]);

  const submitMutation = useMutation({
    mutationFn: submitMiningUpdate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["submit-page-data"] });
      setEditProof(null);
      setNewSourceName("");
      setNewSourceBlocks("");
      setNewSourcePlayerRows([{ username: viewer?.username ?? "", blocksMined: "" }]);
      setNewSourceProof(null);
      toast.success("Submission sent for review.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editBlocksNumber = parseBlocks(editBlocks);
  const newSourceBlocksNumber = parseBlocks(newSourceBlocks);
  const isNewServerSource = isServerSourceType(newSourceType);
  const parsedNewSourcePlayerRows = newSourcePlayerRows.map((row) => ({
    username: row.username.trim(),
    blocksMined: parsePositiveBlocks(row.blocksMined),
  }));
  const newSourcePlayerRowsValid = parsedNewSourcePlayerRows.length > 0
    && parsedNewSourcePlayerRows.length <= 50
    && parsedNewSourcePlayerRows.every((row) => row.username && row.blocksMined != null);
  const newSourcePlayerTotal = parsedNewSourcePlayerRows.reduce((sum, row) => sum + (row.blocksMined ?? 0), 0);

  const emptySourceMessage = useMemo(() => {
    if (!isLinked) return "Link an approved Minecraft profile before submitting source updates.";
    return "No existing sources were found for your linked Minecraft username.";
  }, [isLinked]);

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />
      <main className="container py-6 md:py-8">
        {isAuthLoading ? (
          <GlassCard className="p-8 text-center">
            <p className="font-pixel text-[10px] text-muted-foreground">CHECKING YOUR SECURE SESSION...</p>
          </GlassCard>
        ) : !isLoggedIn ? (
          <AuthRequiredState title="Submit Locked" subtitle="Log in first to submit mining proof or update your own blocks mined." />
        ) : !isLinked ? (
          <GlassCard glow="primary" className="mx-auto max-w-2xl p-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center border border-primary/30 bg-primary/10">
              <LockKeyhole className="h-7 w-7 text-primary" />
            </div>
            <h1 className="font-pixel text-xl text-foreground">Minecraft Link Required</h1>
            <p className="mx-auto mt-3 max-w-md text-[10px] leading-[1.8] text-muted-foreground">
              Your Discord account must have an approved Minecraft profile before you can submit source updates.
            </p>
            <Link to="/account" className="mt-6 inline-flex">
              <Button className="btn-glow bg-primary px-5 text-primary-foreground hover:bg-primary/90">Open Account</Button>
            </Link>
          </GlassCard>
        ) : (
          <div className="space-y-6">
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pixel-card grid-bg border border-border p-6 md:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                    <span className="font-pixel text-[9px]">PROOF REQUIRED</span>
                  </div>
                  <h1 className="font-pixel text-3xl leading-tight text-foreground md:text-5xl">
                    Submit Updates<span className="animate-blink text-primary">_</span>
                  </h1>
                  <p className="max-w-2xl font-display text-2xl leading-tight text-muted-foreground">
                    Submit new mining proof or update your own blocks mined.
                  </p>
                </div>
                <div className="pixel-card min-w-[220px] px-4 py-3">
                  <div className="font-pixel text-[8px] uppercase tracking-wider text-muted-foreground">Linked Player</div>
                  <div className="mt-2 font-pixel text-[12px] text-foreground">{submitQuery.data?.player.minecraftUsername ?? viewer.username}</div>
                </div>
              </div>
            </motion.section>

            {submitQuery.isLoading ? (
              <GlassCard className="p-6 text-center font-pixel text-[10px] text-muted-foreground">LOADING SUBMIT DATA...</GlassCard>
            ) : submitQuery.error ? (
              <GlassCard className="border-rose-400/20 bg-rose-500/10 p-6 text-[10px] text-rose-100">
                {(submitQuery.error as Error).message}
              </GlassCard>
            ) : (
              <Tabs defaultValue="edit" className="space-y-5">
                <TabsList className="grid w-full grid-cols-2 border border-border bg-card p-1">
                  <TabsTrigger value="edit" className="font-pixel text-[9px]">Edit Existing Source</TabsTrigger>
                  <TabsTrigger value="new" className="font-pixel text-[9px]">Add New Source</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="space-y-4">
                  <GlassCard className="space-y-5 p-6">
                    <div className="space-y-1">
                      <h2 className="font-pixel text-[14px] text-foreground">Edit Existing Source</h2>
                      <p className="text-[9px] leading-[1.8] text-muted-foreground">
                        Choose a source where your linked player already exists. Only your own blocks mined value is submitted for review.
                      </p>
                    </div>

                    {sources.length === 0 ? (
                      <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">{emptySourceMessage}</div>
                    ) : (
                      <>
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.55fr)]">
                          <div className="space-y-2">
                            <Label className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground">Source</Label>
                            <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                              <SelectTrigger className="h-12 bg-card font-pixel text-[10px]">
                                <SelectValue placeholder="Choose source" />
                              </SelectTrigger>
                              <SelectContent>
                                {sources.map((source) => (
                                  <SelectItem key={source.sourceId} value={source.sourceId}>
                                    {source.sourceName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {selectedSource ? (
                            <div className="pixel-card p-3">
                              <SourceOption source={selectedSource} />
                            </div>
                          ) : null}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="pixel-card p-4">
                            <div className="font-pixel text-[8px] uppercase tracking-wider text-muted-foreground">Current Value</div>
                            <BlocksMinedValue as="div" value={selectedSource?.currentBlocks ?? 0} className="mt-2 font-pixel text-xl">
                              {(selectedSource?.currentBlocks ?? 0).toLocaleString()}
                            </BlocksMinedValue>
                          </div>
                          <div className="space-y-2">
                            <Label className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground">New Submitted Value</Label>
                            <Input value={editBlocks} onChange={(event) => setEditBlocks(event.target.value)} className="font-pixel text-[10px]" placeholder="Blocks mined" />
                            {editBlocks && editBlocksNumber == null ? (
                              <p className="text-[8px] text-rose-100">Enter a non-negative whole number.</p>
                            ) : null}
                          </div>
                        </div>

                        <ProofPicker proof={editProof} previewUrl={editPreview} onProofChange={setEditProof} />

                        <Button
                          className="btn-glow gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={submitMutation.isPending || !selectedSource || editBlocksNumber == null || !editProof || !isValidProof(editProof)}
                          onClick={() => {
                            if (!selectedSource || editBlocksNumber == null || !editProof) return;
                            submitMutation.mutate({
                              type: "edit-existing-source",
                              sourceId: selectedSource.sourceId,
                              blocksMined: editBlocksNumber,
                              proof: editProof,
                            });
                          }}
                        >
                          <Send className="h-4 w-4" />
                          Send For Review
                        </Button>
                      </>
                    )}
                  </GlassCard>
                </TabsContent>

                <TabsContent value="new" className="space-y-4">
                  <GlassCard className="space-y-5 p-6">
                    <div className="space-y-1">
                      <h2 className="font-pixel text-[14px] text-foreground">Add New Source</h2>
                      <p className="text-[9px] leading-[1.8] text-muted-foreground">
                        New sources are created as pending submissions. Admins must review proof before anything goes live.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground">Source Name</Label>
                        <Input value={newSourceName} onChange={(event) => setNewSourceName(event.target.value)} className="font-pixel text-[10px]" placeholder="Source name" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground">Source Type</Label>
                        <Select
                          value={newSourceType}
                          onValueChange={(value) => {
                            setNewSourceType(value);
                            if (isServerSourceType(value) && newSourcePlayerRows.length === 0) {
                              setNewSourcePlayerRows([{ username: viewer.username, blocksMined: "" }]);
                            }
                          }}
                        >
                          <SelectTrigger className="h-10 bg-card font-pixel text-[10px]">
                            <SelectValue placeholder="Source type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="private-server">Private Server</SelectItem>
                            <SelectItem value="server">Server</SelectItem>
                            <SelectItem value="singleplayer">Singleplayer</SelectItem>
                            <SelectItem value="hardcore">Hardcore</SelectItem>
                            <SelectItem value="ssp">SSP</SelectItem>
                            <SelectItem value="hsp">HSP</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {isNewServerSource ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <Label className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground">Submitted Players</Label>
                            <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">Add up to 50 players. Source total is calculated from these rows.</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <BlocksMinedValue value={newSourcePlayerTotal} className="font-pixel text-[10px]">
                              {newSourcePlayerTotal.toLocaleString()}
                            </BlocksMinedValue>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={newSourcePlayerRows.length >= 50}
                              onClick={() => setNewSourcePlayerRows((rows) => [...rows, { username: "", blocksMined: "" }])}
                            >
                              <Plus className="mr-2 h-3.5 w-3.5" />
                              Player
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {newSourcePlayerRows.map((row, index) => {
                            const rowBlocks = parsePositiveBlocks(row.blocksMined);
                            return (
                              <div key={index} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                                <Input
                                  value={row.username}
                                  onChange={(event) => setNewSourcePlayerRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, username: event.target.value } : item))}
                                  className="font-pixel text-[10px]"
                                  placeholder="Player name"
                                />
                                <Input
                                  value={row.blocksMined}
                                  onChange={(event) => setNewSourcePlayerRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, blocksMined: event.target.value } : item))}
                                  className="font-pixel text-[10px]"
                                  placeholder="Blocks mined"
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  disabled={newSourcePlayerRows.length <= 1}
                                  onClick={() => setNewSourcePlayerRows((rows) => rows.filter((_, itemIndex) => itemIndex !== index))}
                                  aria-label="Remove player row"
                                  title="Remove player row"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                                {row.blocksMined && rowBlocks == null ? (
                                  <p className="text-[8px] text-rose-100 md:col-span-3">Blocks mined must be a positive whole number.</p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-md space-y-2">
                        <Label className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground">Blocks Mined</Label>
                        <Input value={newSourceBlocks} onChange={(event) => setNewSourceBlocks(event.target.value)} className="font-pixel text-[10px]" placeholder="Blocks mined" />
                        {newSourceBlocks && newSourceBlocksNumber == null ? (
                          <p className="text-[8px] text-rose-100">Enter a non-negative whole number.</p>
                        ) : null}
                      </div>
                    )}

                    <ProofPicker proof={newSourceProof} previewUrl={newSourcePreview} onProofChange={setNewSourceProof} />

                    <Button
                      className="btn-glow gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={submitMutation.isPending || !newSourceName.trim() || (isNewServerSource ? !newSourcePlayerRowsValid : newSourceBlocksNumber == null) || !newSourceProof || !isValidProof(newSourceProof)}
                      onClick={() => {
                        if (!newSourceProof) return;
                        if (isNewServerSource && !newSourcePlayerRowsValid) return;
                        if (!isNewServerSource && newSourceBlocksNumber == null) return;
                        submitMutation.mutate({
                          type: "add-new-source",
                          sourceName: newSourceName,
                          sourceType: newSourceType,
                          blocksMined: isNewServerSource ? newSourcePlayerTotal : newSourceBlocksNumber ?? 0,
                          playerRows: isNewServerSource
                            ? parsedNewSourcePlayerRows.map((row) => ({ username: row.username, blocksMined: row.blocksMined ?? 0 }))
                            : undefined,
                          proof: newSourceProof,
                        });
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Submit New Source
                    </Button>
                  </GlassCard>
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
