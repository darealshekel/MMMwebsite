export function sanitizePublicText(value: string | null | undefined, fallback = "") {
  if (!value) {
    return fallback;
  }

  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

