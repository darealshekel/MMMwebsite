import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRows = vi.hoisted(() => ({
  manualOverrides: [] as Array<{ id: string; kind: string; data: Record<string, unknown> }>,
  auditRows: [] as Array<Record<string, unknown>>,
  submissions: [] as Array<Record<string, unknown>>,
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

import { listEditableSinglePlayers, listEditableSinglePlayerSources, updateEditableSource } from "./admin-management.js";
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
});
