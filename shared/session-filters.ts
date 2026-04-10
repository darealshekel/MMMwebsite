export const MIN_SESSION_DURATION_SECONDS = 15 * 60;

export function normalizeSessionDurationSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed));
}

export function isQualifyingCompletedSession(input: {
  status?: string | null;
  activeSeconds?: number | null;
  endedAt?: string | null;
}) {
  return input.status === "ended"
    && Boolean(input.endedAt)
    && normalizeSessionDurationSeconds(input.activeSeconds) >= MIN_SESSION_DURATION_SECONDS;
}
