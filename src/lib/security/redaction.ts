const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_PATTERN = /\b(?:[a-f0-9]{1,4}:){2,7}[a-f0-9]{1,4}\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi;
const TOKEN_PATTERN = /\b(?:apikey|token|secret|password|cookie|set-cookie|authorization)\b\s*[:=]\s*([^\s,;]+)/gi;

export function redactSensitiveText(input: string) {
  return input
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(TOKEN_PATTERN, (_match, value) => _match.replace(value, "[REDACTED]"))
    .replace(IPV4_PATTERN, "[REDACTED_IP]")
    .replace(IPV6_PATTERN, "[REDACTED_IP]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(PHONE_PATTERN, "[REDACTED_PHONE]")
    ;
}

export function redactForLog(value: unknown): string {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  try {
    return redactSensitiveText(JSON.stringify(value));
  } catch {
    return "[UNSERIALIZABLE_REDACTED]";
  }
}
