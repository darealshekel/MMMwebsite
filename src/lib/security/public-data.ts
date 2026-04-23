export function sanitizePublicText(value: string | null | undefined, fallback = "") {
  if (!value) {
    return fallback;
  }

  return Array.from(value).filter((char) => {
    const code = char.charCodeAt(0);
    return (code >= 32 && code !== 127) || code > 127;
  }).join("").trim();
}
