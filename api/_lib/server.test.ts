import { describe, expect, it } from "vitest";
import { createCookie, hmac, safeInternalPath } from "./server";

describe("server security helpers", () => {
  it("creates secure cookies by default", () => {
    const cookie = createCookie("aetweaks_session", "value");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("rejects unsafe return paths", () => {
    expect(safeInternalPath("https://evil.example")).toBe("/dashboard");
    expect(safeInternalPath("//evil.example")).toBe("/dashboard");
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
  });

  it("produces deterministic HMACs for the same input", async () => {
    const first = await hmac("user-1", "test-secret");
    const second = await hmac("user-1", "test-secret");
    const third = await hmac("user-2", "test-secret");
    expect(first).toBe(second);
    expect(first).not.toBe(third);
  });
});
