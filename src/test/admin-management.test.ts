import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { canTransitionRole } from "../../shared/admin-management.js";
import { createLocalAdminState } from "../../tools/local-admin-state.mjs";

function fakeUuidForUsername(username: string) {
  const hex = crypto.createHash("md5").update(`mmm-local:${username.toLowerCase()}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function createState() {
  return createLocalAdminState({
    spreadsheetSnapshot: {
      sources: [
        {
          id: "source-alpha",
          slug: "alpha-source",
          displayName: "Alpha Source",
          sourceType: "world",
          logoUrl: null,
          totalBlocks: 300,
          isDead: false,
          sourceScope: "digs_logo_only",
          hasSpreadsheetTotal: true,
          rows: [
            {
              username: "5hekel",
              blocksMined: 100,
              lastUpdated: "2026-04-21T00:00:00.000Z",
              playerFlagUrl: null,
            },
            {
              username: "LukeEm",
              blocksMined: 200,
              lastUpdated: "2026-04-21T00:00:00.000Z",
              playerFlagUrl: null,
            },
          ],
        },
      ],
      specialLeaderboards: {},
    },
    publicSources: [
      {
        id: "source-alpha",
        slug: "alpha-source",
        displayName: "Alpha Source",
        sourceType: "world",
        logoUrl: null,
        totalBlocks: 300,
        isDead: false,
        playerCount: 2,
        sourceScope: "digs_logo_only",
        hasSpreadsheetTotal: true,
      },
    ],
    mainRows: [
      {
        playerId: "local-owner-player",
        username: "5hekel",
        skinFaceUrl: "",
        playerFlagUrl: null,
        lastUpdated: "2026-04-21T00:00:00.000Z",
        blocksMined: 100,
        totalDigs: 100,
        rank: 1,
        sourceServer: "Alpha Source",
        sourceKey: "global:5hekel",
        sourceCount: 1,
        viewKind: "global",
        sourceId: "source-alpha",
        sourceSlug: "alpha-source",
        rowKey: "global:5hekel",
      },
      {
        playerId: "local-player:lukeem",
        username: "LukeEm",
        skinFaceUrl: "",
        playerFlagUrl: null,
        lastUpdated: "2026-04-21T00:00:00.000Z",
        blocksMined: 200,
        totalDigs: 200,
        rank: 2,
        sourceServer: "Alpha Source",
        sourceKey: "global:lukeem",
        sourceCount: 1,
        viewKind: "global",
        sourceId: "source-alpha",
        sourceSlug: "alpha-source",
        rowKey: "global:lukeem",
      },
    ],
    adminSources: [
      {
        id: "source-alpha",
        displayName: "Alpha Source",
        worldKey: "alpha-source",
        kind: "multiplayer",
        sourceScope: "public_server",
        totalBlocks: 300,
        playerCount: 2,
        submittedByUsername: "5hekel",
        submittedAt: "2026-04-21T00:00:00.000Z",
        firstSeenAt: "2026-04-21T00:00:00.000Z",
        lastSeenAt: "2026-04-21T00:00:00.000Z",
        approvalStatus: "approved",
        eligibleForPublic: true,
        scanEvidence: {
          scoreboardTitle: "Alpha Source",
          sampleSidebarLines: ["Blocks Mined"],
          detectedStatFields: ["blocks_mined"],
          confidence: 0.99,
          iconUrl: null,
          rawScanEvidence: null,
        },
      },
    ],
    viewer: {
      userId: "local-owner",
      username: "5hekel",
      avatarUrl: "",
      provider: "local-dev",
      role: "owner",
      isAdmin: true,
    },
  });
}

describe("admin management role rules", () => {
  it("blocks admins from assigning owner and prevents removing the last owner", () => {
    expect(
      canTransitionRole({
        actorRole: "admin",
        targetCurrentRole: "player",
        nextRole: "owner",
        ownerCount: 1,
        isSelf: false,
      }),
    ).toEqual({
      ok: false,
      reason: "Admins cannot grant, edit, or remove owner access.",
    });

    expect(
      canTransitionRole({
        actorRole: "owner",
        targetCurrentRole: "owner",
        nextRole: "player",
        ownerCount: 1,
        isSelf: true,
      }),
    ).toEqual({
      ok: false,
      reason: "At least one owner must remain assigned.",
    });
  });
});

describe("local admin state permissions", () => {
  it("lets the owner promote a player to admin and records the audit trail", () => {
    const state = createState();
    const lukeUuid = fakeUuidForUsername("LukeEm");

    const before = state.lookupRole(lukeUuid);
    expect(before.target.role).toBe("player");

    const updated = state.setRole({
      actorRole: "owner",
      actorUserId: "local-owner",
      uuid: lukeUuid,
      role: "admin",
      reason: "Promoted for moderation duty",
    });

    expect(updated.target.role).toBe("admin");
    const audit = state.getAuditEntries().entries[0];
    expect(audit.actionType).toBe("role.set");
  });

  it("blocks admin owner-escalation and blocks players from privileged actions", () => {
    const state = createState();
    const lukeUuid = fakeUuidForUsername("LukeEm");

    state.setRole({
      actorRole: "owner",
      actorUserId: "local-owner",
      uuid: lukeUuid,
      role: "admin",
      reason: "Promoted for moderation duty",
    });

    expect(() =>
      state.setRole({
        actorRole: "admin",
        actorUserId: "local-user:lukeem",
        uuid: lukeUuid,
        role: "owner",
        reason: "Should fail",
      }),
    ).toThrow("Admins cannot grant, edit, or remove owner access.");

    expect(() =>
      state.setFlag({
        actorRole: "player",
        uuid: lukeUuid,
        flagCode: "us",
        reason: "Should fail",
      }),
    ).toThrow("You do not have permission to manage player flags.");

    expect(() =>
      state.updateSource({
        actorRole: "player",
        sourceId: "source-alpha",
        displayName: "Renamed Source",
        reason: "Should fail",
      }),
    ).toThrow("You do not have permission to edit sources.");
  });

  it("lets admins edit flags, site text, moderation state, and source rows safely", () => {
    const state = createState();
    const lukeUuid = fakeUuidForUsername("LukeEm");

    state.setRole({
      actorRole: "owner",
      actorUserId: "local-owner",
      uuid: lukeUuid,
      role: "admin",
      reason: "Promoted for moderation duty",
    });

    const flagResult = state.setFlag({
      actorRole: "admin",
      uuid: lukeUuid,
      flagCode: "us",
      reason: "Flag update",
    });
    expect(flagResult.target.flagCode).toBe("us");

    const siteResult = state.updateSiteContent({
      actorRole: "admin",
      key: "dashboard.heroTitle",
      value: "Owner Control",
      reason: "Content update",
    });
    expect(siteResult.content["dashboard.heroTitle"]).toBe("Owner Control");

    const rowBefore = state.getSourceRows("alpha-source");
    expect(rowBefore?.find((row) => row.username === "LukeEm")?.blocksMined).toBe(200);

    const moderation = state.updateSourceModeration({
      actorRole: "admin",
      sourceId: "source-alpha",
      action: "rejected",
      reason: "Needs review",
    });
    expect(moderation.ok).toBe(true);
    expect(state.getSourceRows("alpha-source")).toBeNull();

    state.updateSourceModeration({
      actorRole: "admin",
      sourceId: "source-alpha",
      action: "approved",
      reason: "Restored for edit",
    });

    const rowResult = state.updateSourcePlayer({
      actorRole: "admin",
      sourceId: "source-alpha",
      playerId: "local-player:lukeem",
      username: "LukeEm",
      blocksMined: 250,
      reason: "Manual correction",
    });

    expect(rowResult.row.blocksMined).toBe(250);
    const source = state.getPublicSources().find((entry) => entry.id === "source-alpha");
    expect(source?.totalBlocks).toBe(350);
  });
});
