import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRows = vi.hoisted(() => ({
  manualOverrides: [] as Array<{ id: string; kind: string; data: Record<string, unknown> }>,
  auditRows: [] as Array<Record<string, unknown>>,
  submissions: [] as Array<Record<string, unknown>>,
  liveEntries: [] as Array<Record<string, unknown>>,
  users: [] as Array<Record<string, unknown>>,
}));

vi.mock("./server.js", () => ({
  hashDeterministicValue: vi.fn(async (value: string) => `hash:${value}`),
  supabaseAdmin: {
    from(table: string) {
      if (table === "mmm_manual_overrides") {
        return {
          select() {
            return {
              eq(_column: string, kind: string) {
                return Promise.resolve({
                  data: mockRows.manualOverrides.filter((row) => row.kind === kind),
                  error: null,
                });
              },
            };
          },
          upsert(row: { id: string; kind: string; data: Record<string, unknown> }) {
            const existingIndex = mockRows.manualOverrides.findIndex((existing) => existing.id === row.id);
            if (existingIndex >= 0) {
              mockRows.manualOverrides[existingIndex] = { id: row.id, kind: row.kind, data: row.data };
            } else {
              mockRows.manualOverrides.push({ id: row.id, kind: row.kind, data: row.data });
            }
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "sources") {
        return {
          select() {
            return {
              ilike() {
                return Promise.resolve({
                  data: null,
                  error: {
                    code: "PGRST205",
                    message: "Could not find the table 'public.sources' in the schema cache",
                  },
                });
              },
            };
          },
        };
      }

      if (table === "leaderboard_entries") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      gt() {
                        return {
                          limit() {
                            return Promise.resolve({ data: mockRows.liveEntries, error: null });
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "users") {
        return {
          select() {
            return {
              in(_column: string, ids: string[]) {
                return Promise.resolve({
                  data: mockRows.users.filter((row) => ids.includes(String(row.id ?? ""))),
                  error: null,
                });
              },
            };
          },
        };
      }

      if (table === "mmm_submissions") {
        return {
          select() {
            return {
              eq(_column: string, status: string) {
                const filtered = mockRows.submissions.filter((row) => row.status === status);
                return {
                  order() {
                    return {
                      limit() {
                        return Promise.resolve({ data: filtered, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "admin_audit_log") {
        return {
          insert(row: Record<string, unknown>) {
            mockRows.auditRows.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      return {
        select() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  },
}));

import { listEditableSinglePlayers, listEditableSinglePlayerSources, searchEditableSources, updateEditableSource } from "./admin-management.js";
import { getStaticEditableSources } from "./static-mmm-leaderboard.js";
import type { AuthContext } from "./session.js";

const ownerAuth = {
  sessionId: "test-session",
  userId: "00000000-0000-4000-8000-000000000001",
  sessionToken: "session-token",
  csrfToken: "csrf-token",
  viewer: {
    userId: "00000000-0000-4000-8000-000000000001",
    minecraftUsername: "5hekel",
    minecraftUuidHash: "",
    provider: "Discord",
    avatarUrl: "",
    role: "owner",
    isAdmin: true,
  },
} satisfies AuthContext;

describe("static admin management", () => {
  beforeEach(() => {
    mockRows.manualOverrides.length = 0;
    mockRows.auditRows.length = 0;
    mockRows.submissions.length = 0;
    mockRows.liveEntries.length = 0;
    mockRows.users.length = 0;
  });

  it("renames static sources when the legacy sources table is not installed", async () => {
    const source = getStaticEditableSources("").find((candidate) => String(candidate.id ?? ""));
    expect(source).toBeTruthy();

    const result = await updateEditableSource(ownerAuth, {
      sourceId: String(source?.id ?? ""),
      displayName: "Owner Edit Regression Source",
      totalBlocks: null,
      logoUrl: null,
      reason: "Regression test",
    });

    expect(result.source.displayName).toBe("Owner Edit Regression Source");
    expect(mockRows.manualOverrides).toContainEqual(expect.objectContaining({
      id: String(source?.id ?? ""),
      kind: "source",
      data: expect.objectContaining({ displayName: "Owner Edit Regression Source" }),
    }));
    expect(mockRows.auditRows).toHaveLength(1);
  });

  it("shows approved submitted sources in single-player manual editor rows", async () => {
    mockRows.submissions.push({
      id: "submitted-source-1",
      source_name: "Submitted Manual World",
      source_type: "singleplayer",
      submitted_blocks_mined: 12345,
      logo_url: null,
      payload: {
        playerRows: [{ username: "SubmittedOnly", blocksMined: 12345 }],
      },
      status: "approved",
      created_at: "2026-04-24T00:00:00.000Z",
    });

    const players = await listEditableSinglePlayers(ownerAuth, "SubmittedOnly");
    const player = players.players.find((row) => row.username === "SubmittedOnly");
    expect(player?.blocksMined).toBe(12345);

    const sources = await listEditableSinglePlayerSources(ownerAuth, String(player?.playerId ?? ""), "");
    expect(sources.rows).toContainEqual(expect.objectContaining({
      sourceName: "Submitted Manual World",
      blocksMined: 12345,
    }));
  });

  it("uses approved live source rows instead of a duplicate static source in the manual editor", async () => {
    const staticAeternum = getStaticEditableSources("").find((source) => String(source.slug ?? "") === "aeternum");
    expect(staticAeternum).toBeTruthy();

    mockRows.users.push({ id: "live-player-5hekel", username: "5hekel" });
    mockRows.liveEntries.push({
      player_id: "live-player-5hekel",
      score: 2179162,
      updated_at: "2026-04-26T19:46:36.641064+03:00",
      source_id: "live-aeternum-source",
      sources: {
        id: "live-aeternum-source",
        slug: "aeternum",
        display_name: "Aeternum",
        source_type: "server",
        is_public: true,
        is_approved: true,
      },
    });

    const sources = await searchEditableSources(ownerAuth, "Aeternum");
    const aeternumSources = sources.sources.filter((source) => source.slug === "aeternum");
    expect(aeternumSources).toHaveLength(1);
    expect(aeternumSources[0]).toEqual(expect.objectContaining({
      id: "live-aeternum-source",
      totalBlocks: 2179162,
      playerCount: 1,
    }));

    const players = await listEditableSinglePlayers(ownerAuth, "5hekel");
    const player = players.players.find((row) => row.username === "5hekel");
    expect(player?.blocksMined).toBeGreaterThanOrEqual(2179162);

    const rows = await listEditableSinglePlayerSources(ownerAuth, String(player?.playerId ?? ""), "");
    const aeternumRows = rows.rows.filter((row) => row.sourceName === "Aeternum");
    expect(aeternumRows).toHaveLength(1);
    expect(aeternumRows[0]).toEqual(expect.objectContaining({
      sourceId: "live-aeternum-source",
      blocksMined: 2179162,
    }));
  });
});
