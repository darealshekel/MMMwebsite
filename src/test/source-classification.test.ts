import { describe, expect, it } from "vitest";
import {
  HSP_SOURCE_LOGO_URL,
  SSP_SOURCE_LOGO_URL,
  isHspSource,
  isIndividualWorldDigsSource,
  isSspSource,
  shouldShowInPrivateServerDigs,
} from "../../shared/source-classification.js";

describe("source classification", () => {
  it("classifies the HSP logo as HSP and not SSP", () => {
    const source = {
      displayName: "Individual World Digs 1",
      sourceType: "singleplayer",
      logoUrl: HSP_SOURCE_LOGO_URL,
    };

    expect(isHspSource(source)).toBe(true);
    expect(isSspSource(source)).toBe(false);
  });

  it("classifies the SSP logo as SSP and not HSP", () => {
    const source = {
      displayName: "World One",
      sourceType: "singleplayer",
      logoUrl: SSP_SOURCE_LOGO_URL,
    };

    expect(isSspSource(source)).toBe(true);
    expect(isHspSource(source)).toBe(false);
  });

  it("matches numbered Individual World Digs names safely", () => {
    expect(isIndividualWorldDigsSource({ displayName: "Individual World Digs" })).toBe(true);
    expect(isIndividualWorldDigsSource({ displayName: "Individual World Digs 1" })).toBe(true);
    expect(isIndividualWorldDigsSource({ displayName: "individual   world   digs (12)" })).toBe(true);
    expect(isIndividualWorldDigsSource({ displayName: "Individual World Digs Extra" })).toBe(false);
  });

  it("excludes singleplayer worlds from Private Server Digs", () => {
    const sources = [
      { displayName: "Aeternum", totalBlocks: 100 },
      { displayName: "Individual World Digs (1)", totalBlocks: 900 },
      { displayName: "SSP World 01", totalBlocks: 800 },
      { displayName: "HSP World 01", totalBlocks: 700 },
      { displayName: "Unlabeled World 01", sourceScope: "ssp_hsp", totalBlocks: 600 },
      { displayName: "Player World", sourceType: "singleplayer", totalBlocks: 500 },
      { displayName: "Scoped SSP", sourceCategory: "ssp-hsp", totalBlocks: 400 },
    ];
    const visible = sources.filter(shouldShowInPrivateServerDigs);

    expect(visible.map((source) => source.displayName)).toEqual(["Aeternum"]);
    expect(visible.reduce((sum, source) => sum + source.totalBlocks, 0)).toBe(100);
  });
});
