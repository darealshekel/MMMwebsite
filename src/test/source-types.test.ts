import { describe, expect, it } from "vitest";
import {
  isServerSourceType,
  normalizeSourceType,
  normalizeSourceTypeOrNull,
  sourceKindForType,
  sourceScopeForType,
} from "../../shared/source-types.js";

describe("source type normalization", () => {
  it("maps legacy source type labels to canonical source categories", () => {
    expect(normalizeSourceType("private-server")).toBe("server");
    expect(normalizeSourceType("Private Server")).toBe("server");
    expect(normalizeSourceType("singleplayer")).toBe("ssp");
    expect(normalizeSourceType("Hardcore")).toBe("hsp");
    expect(normalizeSourceType("ssp")).toBe("ssp");
    expect(normalizeSourceType("hsp")).toBe("hsp");
  });

  it("rejects unsupported direct-add source types", () => {
    expect(normalizeSourceTypeOrNull("other")).toBeNull();
    expect(normalizeSourceTypeOrNull("")).toBeNull();
  });

  it("derives approval scope and moderation kind from canonical type", () => {
    expect(isServerSourceType("private-server")).toBe(true);
    expect(sourceScopeForType("server")).toBe("public_server");
    expect(sourceKindForType("server")).toBe("multiplayer");
    expect(sourceScopeForType("ssp")).toBe("private_singleplayer");
    expect(sourceKindForType("hsp")).toBe("singleplayer");
    expect(sourceScopeForType("other")).toBe("unsupported");
    expect(sourceKindForType("other")).toBe("unknown");
  });
});

