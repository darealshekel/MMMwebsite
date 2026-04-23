import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export type SessionCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge: number;
};

export async function hashPassword(password: string) {
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }

  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPasswordHash(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function createSecureSessionCookieOptions(maxAgeSeconds = 60 * 60 * 24): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

