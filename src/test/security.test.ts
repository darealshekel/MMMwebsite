import { describe, expect, it } from "vitest";

import {
  buildSecurityHeaders,
  clientErrorResponse,
  decryptAtRest,
  encryptAtRest,
} from "../../supabase/functions/_shared/security";
import { createSecureSessionCookieOptions, hashPassword, verifyPasswordHash } from "@/lib/security/auth";
import { PUBLIC_PLAYER_SELECT, isSensitiveFieldName } from "@/lib/security/data-policy";
import { redactForLog, redactSensitiveText } from "@/lib/security/redaction";

describe("security hardening", () => {
  it("hashes passwords and verifies them safely", async () => {
    const password = "super-secure-password";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.startsWith("$2")).toBe(true);
    await expect(verifyPasswordHash(password, hash)).resolves.toBe(true);
    await expect(verifyPasswordHash("wrong-password", hash)).resolves.toBe(false);
  });

  it("encrypts sensitive fields at rest with key rotation support", async () => {
    const keyRing = {
      v1: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      v2: "ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=",
    };
    const encrypted = await encryptAtRest("player-uuid-value", keyRing, "v2");

    expect(encrypted.startsWith("enc.v2.")).toBe(true);
    await expect(decryptAtRest(encrypted, keyRing)).resolves.toBe("player-uuid-value");
  });

  it("uses secure cookie defaults for server-side sessions", () => {
    expect(createSecureSessionCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  });

  it("does not leak IP addresses in client-safe API errors", async () => {
    const headers = buildSecurityHeaders("https://aewt-sync-pro.vercel.app", "https://aewt-sync-pro.vercel.app");
    const response = clientErrorResponse(headers, 500, "Unable to process the request.");
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
    expect(JSON.stringify(body)).not.toContain("x-forwarded-for");
    expect(body).toEqual({ error: "Unable to process the request." });
  });

  it("redacts IPs, tokens, secrets, emails, and phone numbers from logs", () => {
    const raw = "authorization=Bearer abc.def.ghi ip=203.0.113.4 email=test@example.com phone=+1 (555) 111-2222";
    const redacted = redactSensitiveText(raw);

    expect(redacted).not.toContain("203.0.113.4");
    expect(redacted).not.toContain("abc.def.ghi");
    expect(redacted).not.toContain("test@example.com");
    expect(redacted).not.toContain("111-2222");
    expect(redactForLog({ raw })).toContain("[REDACTED_IP]");
  });

  it("keeps private identifiers out of public player queries", () => {
    expect(PUBLIC_PLAYER_SELECT).not.toContain("client_id");
    expect(PUBLIC_PLAYER_SELECT).not.toContain("minecraft_uuid");
    expect(isSensitiveFieldName("client_id")).toBe(true);
    expect(isSensitiveFieldName("minecraft_uuid")).toBe(true);
  });
});
