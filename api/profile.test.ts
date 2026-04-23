import { describe, expect, it } from "vitest";
import { sanitizePatch } from "./profile.js";

describe("sanitizePatch", () => {
  it("keeps only allowed profile fields", () => {
    expect(
      sanitizePatch({
        publicProfile: true,
        leaderboardOptIn: false,
        sessionSharing: true,
        hudEnabled: true,
        hudAlignment: "bottom-left",
        hudScale: 4,
        minecraft_uuid: "leak-me",
        userId: "other-user",
      }),
    ).toEqual({
      publicProfile: true,
      leaderboardOptIn: false,
      sessionSharing: true,
      hudEnabled: true,
      hudAlignment: "bottom-left",
      hudScale: 3,
    });
  });

  it("drops invalid payloads", () => {
    expect(sanitizePatch(null)).toEqual({});
    expect(sanitizePatch("oops")).toEqual({});
  });
});
