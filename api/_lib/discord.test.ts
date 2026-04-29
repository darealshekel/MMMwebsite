import { afterEach, describe, expect, it, vi } from "vitest";

describe("Discord OAuth redirect URI", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the mmmaniacs.com request origin instead of a stale configured deployment URL", async () => {
    vi.stubEnv("DISCORD_REDIRECT_URI", "https://old-deployment.vercel.app/api/auth/discord/callback");
    const { discordRedirectUri } = await import("./discord.js");

    expect(discordRedirectUri(new Request("https://www.mmmaniacs.com/api/auth/discord/start"))).toBe(
      "https://www.mmmaniacs.com/api/auth/discord/callback",
    );
    expect(discordRedirectUri(new Request("https://mmmaniacs.com/api/auth/discord/start"))).toBe(
      "https://mmmaniacs.com/api/auth/discord/callback",
    );
  });
});
