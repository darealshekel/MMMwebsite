import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function normalizePlayerName(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/\s+\(new\)\s*$/i, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const aliases: Record<string, string> = {
    mmagmaa: "florallymagma",
    c1lz: "babyiloveyou",
    driulol: "driuud",
    linda0790: "linda0709",
    alugia7: "algi_",
  };

  return aliases[normalized] ?? normalized;
}

function normalizeSourceName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), "src/generated/mmm-spreadsheet-source-data.json"), "utf8"),
) as {
  meta?: {
    missingPlayersOnlyBackfill?: {
      sourceSpreadsheetId?: string;
      importedPlayerKeys?: string[];
    };
  };
  mainLeaderboard?: {
    rows?: Array<{ username?: string; sourceServer?: string }>;
  };
  sources?: Array<{
    id?: string;
    displayName?: string;
    slug?: string;
    totalBlocks?: number;
    playerCount?: number;
    rows?: Array<{ username?: string; sourceServer?: string; blocksMined?: number }>;
  }>;
  specialLeaderboards?: Record<string, {
    sources?: Array<{
      id?: string;
      sourceCategory?: string;
      displayName?: string;
      rows?: Array<{ username?: string; sourceServer?: string; blocksMined?: number }>;
    }>;
  }>;
};

describe("missing players only spreadsheet import", () => {
  it("records imported player identities and keeps them unique", () => {
    const importedKeys = snapshot.meta?.missingPlayersOnlyBackfill?.importedPlayerKeys ?? [];

    expect(snapshot.meta?.missingPlayersOnlyBackfill?.sourceSpreadsheetId).toBe("1c3Ctu0wFy0z5NhC6CKLeMOjf86CxxV4RaeH0ISnry_s");
    expect(importedKeys.length).toBeGreaterThan(0);
    expect(new Set(importedKeys).size).toBe(importedKeys.length);

    const counts = new Map<string, number>();
    for (const row of snapshot.mainLeaderboard?.rows ?? []) {
      const key = normalizePlayerName(row.username);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    for (const key of importedKeys) {
      expect(counts.get(key)).toBe(1);
    }
  });

  it("does not duplicate imported player source stats", () => {
    const importedKeys = new Set(snapshot.meta?.missingPlayersOnlyBackfill?.importedPlayerKeys ?? []);
    const seen = new Set<string>();

    for (const source of snapshot.specialLeaderboards?.["ssp-hsp"]?.sources ?? []) {
      const category = source.sourceCategory ?? "ssp-hsp";
      for (const row of source.rows ?? []) {
        const playerKey = normalizePlayerName(row.username);
        if (!importedKeys.has(playerKey)) continue;

        const sourceName = normalizeSourceName(row.sourceServer || source.displayName);
        const key = `${category}:${playerKey}:${sourceName}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("keeps mmagmaa hidden because it is FlorallyMagma after rename", () => {
    const rows = snapshot.mainLeaderboard?.rows ?? [];
    const rawNames = rows.map((row) => String(row.username ?? "").toLowerCase());

    expect(rawNames).not.toContain("mmagmaa");
    expect(rawNames).toContain("florallymagma");
    expect(snapshot.meta?.missingPlayersOnlyBackfill?.importedPlayerKeys ?? []).not.toContain("mmagmaa");
  });

  it("keeps c1lz hidden because it is BabyILoveYou after rename", () => {
    const rows = snapshot.mainLeaderboard?.rows ?? [];
    const rawNames = rows.map((row) => String(row.username ?? "").toLowerCase());
    const allSources = [
      ...(snapshot.sources ?? []),
      ...(snapshot.specialLeaderboards?.["ssp-hsp"]?.sources ?? []),
    ];

    expect(rawNames).not.toContain("c1lz");
    expect(rawNames).toContain("babyiloveyou");
    expect(snapshot.meta?.missingPlayersOnlyBackfill?.importedPlayerKeys ?? []).not.toContain("c1lz");

    for (const source of allSources) {
      expect(String(source.displayName ?? "").toLowerCase()).not.toContain("c1lz");
      expect(String(source.slug ?? "").toLowerCase()).not.toContain("c1lz");
      for (const row of source.rows ?? []) {
        expect(String(row.username ?? "").toLowerCase()).not.toBe("c1lz");
        expect(String(row.sourceServer ?? "").toLowerCase()).not.toContain("c1lz");
      }
    }
  });

  it("keeps DriuLOL hidden because it is driuud after rename", () => {
    const rows = snapshot.mainLeaderboard?.rows ?? [];
    const rawNames = rows.map((row) => String(row.username ?? "").toLowerCase());
    const allSources = [
      ...(snapshot.sources ?? []),
      ...(snapshot.specialLeaderboards?.["ssp-hsp"]?.sources ?? []),
    ];

    expect(rawNames).not.toContain("driulol");
    expect(rawNames).toContain("driuud");
    expect(snapshot.meta?.missingPlayersOnlyBackfill?.importedPlayerKeys ?? []).not.toContain("driulol");

    for (const source of allSources) {
      expect(String(source.displayName ?? "").toLowerCase()).not.toContain("driulol");
      expect(String(source.slug ?? "").toLowerCase()).not.toContain("driulol");
      for (const row of source.rows ?? []) {
        expect(String(row.username ?? "").toLowerCase()).not.toBe("driulol");
        expect(String(row.sourceServer ?? "").toLowerCase()).not.toContain("driulol");
      }
    }
  });

  it("keeps duplicate spreadsheet rename candidates hidden", () => {
    const rows = snapshot.mainLeaderboard?.rows ?? [];
    const rawNames = rows.map((row) => String(row.username ?? "").toLowerCase());
    const allSources = [
      ...(snapshot.sources ?? []),
      ...(snapshot.specialLeaderboards?.["ssp-hsp"]?.sources ?? []),
    ];
    const removedNames = ["linda0790", "alugia7"];

    expect(rawNames).not.toContain("linda0790");
    expect(rawNames).not.toContain("alugia7");
    expect(rawNames).toContain("linda0709");
    expect(rawNames).toContain("algi_");

    const importedKeys = snapshot.meta?.missingPlayersOnlyBackfill?.importedPlayerKeys ?? [];
    for (const removedName of removedNames) {
      expect(importedKeys).not.toContain(removedName);
    }

    for (const source of allSources) {
      for (const removedName of removedNames) {
        expect(String(source.displayName ?? "").toLowerCase()).not.toContain(removedName);
        expect(String(source.slug ?? "").toLowerCase()).not.toContain(removedName);
      }
      for (const row of source.rows ?? []) {
        expect(removedNames).not.toContain(String(row.username ?? "").toLowerCase());
      }
    }
  });

  it("does not leave supplemental spreadsheet headers as source names", () => {
    const rawHeaderPattern = /^individual world digs/i;
    const allSources = [
      ...(snapshot.sources ?? []),
      ...(snapshot.specialLeaderboards?.["ssp-hsp"]?.sources ?? []),
    ];

    for (const source of allSources) {
      expect(String(source.displayName ?? "")).not.toMatch(rawHeaderPattern);
      for (const row of source.rows ?? []) {
        expect(String(row.sourceServer ?? "")).not.toMatch(rawHeaderPattern);
      }
    }

    for (const row of snapshot.mainLeaderboard?.rows ?? []) {
      expect(String(row.sourceServer ?? "")).not.toMatch(rawHeaderPattern);
    }
  });

  it("keeps source-only private server players visible in the main leaderboard", () => {
    const mainPlayers = new Set((snapshot.mainLeaderboard?.rows ?? []).map((row) => normalizePlayerName(row.username)));
    const phoenix = (snapshot.sources ?? []).find((source) => source.slug === "phoenix");

    expect(phoenix).toBeTruthy();
    expect(phoenix?.rows?.some((row) => normalizePlayerName(row.username) === "xiphosal")).toBe(true);
    expect(mainPlayers.has("xiphosal")).toBe(true);

    for (const source of snapshot.sources ?? []) {
      for (const row of source.rows ?? []) {
        const playerKey = normalizePlayerName(row.username);
        if (!playerKey) continue;
        expect(mainPlayers.has(playerKey)).toBe(true);
      }
    }
  });

  it("consolidates only the Corsarius scoreboard rows into one private source", () => {
    const corsariusBlocks = new Map([
      ["kickwhite", 933598],
      ["champaxx", 722337],
      ["thorjaime", 595242],
      ["manuelsantana11", 500000],
      ["legendh", 483170],
      ["miceboom", 422393],
      ["sacodepienso_", 325170],
      ["elslimefurioso", 321090],
      ["ngiokai", 282197],
      ["butter_ctm", 225041],
      ["samugetta19", 221228],
      ["gueltamax", 206471],
      ["trescok", 197883],
      ["ronambulo", 185811],
      ["lobo03", 173706],
    ]);

    const corsarius = (snapshot.sources ?? []).find((source) => normalizeSourceName(source.displayName) === "corsarius");
    expect(corsarius).toBeTruthy();

    const corsariusRows = corsarius?.rows ?? [];
    const corsariusRowPlayers = new Set(corsariusRows.map((row) => normalizePlayerName(row.username)));
    for (const [player, blocksMined] of corsariusBlocks) {
      expect(corsariusRowPlayers.has(player)).toBe(true);
      expect(corsariusRows.find((row) => normalizePlayerName(row.username) === player)?.blocksMined).toBe(blocksMined);
    }

    expect(corsarius?.playerCount).toBe(corsariusRows.length);
    expect(corsarius?.totalBlocks).toBe(5795337);
    expect(corsarius?.totalBlocks).toBe(corsariusRows.reduce((total, row) => total + Number(row.blocksMined ?? 0), 0));

    const allSources = [
      ...(snapshot.sources ?? []),
      ...(snapshot.specialLeaderboards?.["ssp-hsp"]?.sources ?? []),
    ];
    for (const source of allSources) {
      for (const row of source.rows ?? []) {
        const player = normalizePlayerName(row.username);
        if (!corsariusBlocks.has(player)) continue;

        expect(normalizeSourceName(row.sourceServer || source.displayName)).not.toMatch(/^unlabeled world 0[12]$/);
      }
    }
  });

  it("leaves unrelated unlabeled worlds untouched", () => {
    const corsariusPlayers = new Set([
      "kickwhite",
      "champaxx",
      "thorjaime",
      "manuelsantana11",
      "legendh",
      "miceboom",
      "sacodepienso_",
      "elslimefurioso",
      "ngiokai",
      "butter_ctm",
      "samugetta19",
      "gueltamax",
      "trescok",
      "ronambulo",
      "lobo03",
    ]);

    const unrelatedUnlabeledWorld = (snapshot.specialLeaderboards?.["ssp-hsp"]?.sources ?? []).some((source) => {
      if (normalizeSourceName(source.displayName) !== "unlabeled world 01") return false;
      return !(source.rows ?? []).some((row) => corsariusPlayers.has(normalizePlayerName(row.username)));
    });

    expect(unrelatedUnlabeledWorld).toBe(true);
  });
});
