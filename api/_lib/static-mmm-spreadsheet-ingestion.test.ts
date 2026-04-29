import { describe, expect, it } from "vitest";
import spreadsheetSnapshot from "./static-mmm-snapshot.js";
import { buildStaticSpecialLeaderboardResponse, getStaticSpecialSources } from "./static-mmm-leaderboard.js";
import { isHspSource, isSspSource } from "../../shared/source-classification.js";

type SnapshotRow = {
  username: string;
  playerId: string;
  blocksMined: number;
};

type SnapshotSource = {
  id: string;
  displayName?: string;
  logoUrl?: string | null;
  sourceScope: string;
  sourceIdentity?: string;
  sourceColumn?: string;
  sourceHeaderCell?: string;
  sourceSymbolHash?: string | null;
  ownerPlayerId?: string;
  playerCount: number;
  totalBlocks: number;
  rows: SnapshotRow[];
};

type SnapshotShape = {
  meta: {
    digsIndividualWorldBackfill: {
      source: string;
      valueColumns: string[];
      added: number;
      updated: number;
      migratedFromLegacy: number;
      skipped: Record<string, number>;
    };
    missingPlayersOnlyBackfill?: {
      sourceRowsAdded: number;
    };
  };
  sources: SnapshotSource[];
  specialLeaderboards: {
    "ssp-hsp": {
      totalBlocks: number;
      rows: SnapshotRow[];
      sources: SnapshotSource[];
    };
  };
};

const snapshot = spreadsheetSnapshot as SnapshotShape;
const ssphsp = snapshot.specialLeaderboards["ssp-hsp"];

function canonicalName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+\(new\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe("static MMM spreadsheet individual world ingestion", () => {
  it("records Digs K:X diagnostics and imports missing cells as player-scoped sources", () => {
    const diagnostics = snapshot.meta.digsIndividualWorldBackfill;
    expect(diagnostics.source).toBe("Digs!I and Digs!K:X");
    expect(diagnostics.valueColumns).toEqual(["L", "N", "P", "R", "T", "V", "X"]);
    expect(diagnostics.added).toBeGreaterThan(0);
    expect(diagnostics.updated).toBeGreaterThan(0);
    expect(diagnostics.migratedFromLegacy).toBeGreaterThan(0);
    expect(diagnostics.skipped.already_exists).toBeGreaterThan(0);

    const backfilledSources = ssphsp.sources.filter((source) => source.sourceIdentity === "digs-tab-individual-world");
    expect(backfilledSources.length).toBeGreaterThanOrEqual(diagnostics.added + diagnostics.migratedFromLegacy);

    for (const source of backfilledSources) {
      expect(source.id).toMatch(/^special:ssp-hsp:digs:/);
      expect(source.sourceScope).toBe("ssp_hsp");
      expect(source.playerCount).toBe(1);
      expect(source.rows).toHaveLength(1);
      expect(source.ownerPlayerId).toBe(source.rows[0].playerId);
      expect(source.totalBlocks).toBe(source.rows[0].blocksMined);
      expect(String(source.rows[0].username)).not.toMatch(/\s+\(new\)\s*$/i);
    }

    const sample = backfilledSources.find((source) => source.id === "special:ssp-hsp:digs:aitorthek1ng:individual-world-digs-03");
    expect(sample?.sourceColumn).toBe("P");
    expect(sample?.rows[0].username).toBe("Aitorthek1ng");
    expect(sample?.rows[0].blocksMined).toBe(14153000);

    const migratedSample = backfilledSources.find((source) => source.id === "special:ssp-hsp:digs:sheronman:individual-world-digs-01");
    expect(migratedSample?.sourceColumn).toBe("L");
    expect(migratedSample?.rows[0].username).toBe("SheronMan");
    expect(migratedSample?.rows[0].blocksMined).toBe(186547000);
  });

  it("does not keep stale legacy SSP/HSP slot rows after Digs K:X migration", () => {
    const backfilledSources = ssphsp.sources.filter((source) => source.sourceIdentity === "digs-tab-individual-world");
    const legacySources = ssphsp.sources.filter(
      (source) => source.id.startsWith("special:ssp-hsp:") && !source.id.startsWith("special:ssp-hsp:digs:"),
    );
    const legacyRowsBySlot = new Map<string, Set<string>>();

    for (const source of legacySources) {
      const slot = source.id.split(":").pop()?.toLowerCase();
      if (!slot) {
        continue;
      }
      legacyRowsBySlot.set(slot, new Set(source.rows.map((row) => canonicalName(row.username))));
    }

    for (const source of backfilledSources) {
      const slot = String(source.sourceHeaderCell ?? "").replace(/\d+$/, "").toLowerCase();
      const player = canonicalName(source.rows[0]?.username);
      expect(legacyRowsBySlot.get(slot)?.has(player)).not.toBe(true);
    }
  });

  it("does not duplicate a Digs individual world when the same player row already belongs to a regular source", () => {
    const backfilledSources = ssphsp.sources.filter((source) => source.sourceIdentity === "digs-tab-individual-world");

    for (const source of backfilledSources) {
      const player = canonicalName(source.rows[0]?.username);
      const symbolHash = source.sourceSymbolHash;
      if (!symbolHash) {
        continue;
      }

      const regularSource = snapshot.sources.find(
        (candidate) =>
          (candidate.id === `private:${symbolHash}` || candidate.id === `digs:${symbolHash}`) &&
          candidate.rows.some((row) => canonicalName(row.username) === player),
      );

      expect(regularSource).toBeUndefined();
    }
  });

  it("keeps every SSP/HSP source total equal to its player row sum", () => {
    for (const source of ssphsp.sources) {
      const rowTotal = source.rows.reduce((sum, row) => sum + Number(row.blocksMined ?? 0), 0);
      expect(source.totalBlocks).toBe(rowTotal);
    }
  });

  it("keeps SSP/HSP aggregate player rows equal to summed source rows", () => {
    const sourceTotals = new Map<string, number>();

    for (const source of ssphsp.sources) {
      for (const row of source.rows) {
        const key = canonicalName(row.username);
        sourceTotals.set(key, (sourceTotals.get(key) ?? 0) + Number(row.blocksMined ?? 0));
      }
    }

    for (const row of ssphsp.rows) {
      expect(row.blocksMined).toBe(sourceTotals.get(canonicalName(row.username)));
    }

    const aggregateTotal = ssphsp.rows.reduce((sum, row) => sum + Number(row.blocksMined ?? 0), 0);
    expect(ssphsp.totalBlocks).toBe(aggregateTotal);
  });

  it("separates HSP logo sources into HSP and keeps them out of SSP", () => {
    const hspSources = getStaticSpecialSources("hsp");
    const sspSources = getStaticSpecialSources("ssp");

    expect(hspSources.length).toBeGreaterThan(0);
    expect(sspSources.length).toBeGreaterThan(0);
    expect(hspSources.every(isHspSource)).toBe(true);
    expect(sspSources.every(isSspSource)).toBe(true);
    expect(sspSources.some(isHspSource)).toBe(false);
  });

  it("builds SSP and HSP totals from their own source rows only", () => {
    const sspUrl = new URL("https://mmm.local/api/leaderboard-special?kind=ssp&page=1&pageSize=20");
    const hspUrl = new URL("https://mmm.local/api/leaderboard-special?kind=hsp&page=1&pageSize=20");
    const sspResponse = buildStaticSpecialLeaderboardResponse(sspUrl);
    const hspResponse = buildStaticSpecialLeaderboardResponse(hspUrl);

    const sspTotal = getStaticSpecialSources("ssp").reduce((sum, source) => sum + Number(source.totalBlocks ?? 0), 0);
    const hspTotal = getStaticSpecialSources("hsp").reduce((sum, source) => sum + Number(source.totalBlocks ?? 0), 0);

    expect(sspResponse?.title).toBe("SSP");
    expect(hspResponse?.title).toBe("HSP");
    expect(sspResponse?.totalBlocks).toBe(sspTotal);
    expect(hspResponse?.totalBlocks).toBe(hspTotal);
    expect(sspTotal + hspTotal).toBe(ssphsp.totalBlocks);
  });
});
