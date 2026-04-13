function normalizeSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function buildSourceSlug(input: {
  displayName?: string | null;
  worldKey?: string | null;
  host?: string | null;
}) {
  const preferred = [
    normalizeText(input.displayName),
    normalizeText(input.worldKey),
    normalizeText(input.host),
  ].find(Boolean);

  const slug = preferred ? normalizeSegment(preferred) : "";
  return slug || "unknown-source";
}

export function buildSourceDisplayName(input: {
  displayName?: string | null;
  worldKey?: string | null;
  host?: string | null;
}) {
  return normalizeText(input.displayName)
    || normalizeText(input.worldKey)
    || normalizeText(input.host)
    || "Unknown Source";
}

export function buildSourceType(kind: string | null | undefined) {
  if (kind === "singleplayer") return "world";
  if (kind === "realm") return "realm";
  return "server";
}
