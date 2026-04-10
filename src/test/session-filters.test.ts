import { describe, expect, it } from "vitest";
import { mapSessions } from "../../api/_lib/dashboard";
import {
  isQualifyingCompletedSession,
  MIN_SESSION_DURATION_SECONDS,
  normalizeSessionDurationSeconds,
} from "../../shared/session-filters";

describe("session filters", () => {
  it("normalizes invalid durations to zero", () => {
    expect(normalizeSessionDurationSeconds(null)).toBe(0);
    expect(normalizeSessionDurationSeconds(undefined)).toBe(0);
    expect(normalizeSessionDurationSeconds("bad")).toBe(0);
  });

  it("rejects sessions shorter than 15 minutes", () => {
    expect(isQualifyingCompletedSession({
      status: "ended",
      activeSeconds: MIN_SESSION_DURATION_SECONDS - 1,
      endedAt: "2026-04-10T12:15:00.000Z",
    })).toBe(false);
  });

  it("includes sessions exactly at 15 minutes", () => {
    expect(isQualifyingCompletedSession({
      status: "ended",
      activeSeconds: MIN_SESSION_DURATION_SECONDS,
      endedAt: "2026-04-10T12:15:00.000Z",
    })).toBe(true);
  });

  it("rejects sessions that have not ended", () => {
    expect(isQualifyingCompletedSession({
      status: "active",
      activeSeconds: MIN_SESSION_DURATION_SECONDS + 60,
      endedAt: null,
    })).toBe(false);

    expect(isQualifyingCompletedSession({
      status: "paused",
      activeSeconds: MIN_SESSION_DURATION_SECONDS + 60,
      endedAt: "2026-04-10T12:15:00.000Z",
    })).toBe(false);
  });

  it("mapSessions only returns completed qualifying sessions", () => {
    const sessions = mapSessions([
      {
        id: "ended-short",
        player_id: "player-1",
        session_key: "ended-short",
        world_id: "world-1",
        started_at: "2026-04-10T10:00:00.000Z",
        ended_at: "2026-04-10T10:14:59.000Z",
        active_seconds: MIN_SESSION_DURATION_SECONDS - 1,
        total_blocks: 100,
        average_bph: 400,
        peak_bph: 500,
        best_streak_seconds: 60,
        top_block: "minecraft:stone",
        status: "ended",
      },
      {
        id: "active-long",
        player_id: "player-1",
        session_key: "active-long",
        world_id: "world-1",
        started_at: "2026-04-10T11:00:00.000Z",
        ended_at: null,
        active_seconds: MIN_SESSION_DURATION_SECONDS + 120,
        total_blocks: 300,
        average_bph: 600,
        peak_bph: 900,
        best_streak_seconds: 120,
        top_block: "minecraft:deepslate",
        status: "active",
      },
      {
        id: "ended-exact-threshold",
        player_id: "player-1",
        session_key: "ended-exact-threshold",
        world_id: "world-1",
        started_at: "2026-04-10T12:00:00.000Z",
        ended_at: "2026-04-10T12:15:00.000Z",
        active_seconds: MIN_SESSION_DURATION_SECONDS,
        total_blocks: 500,
        average_bph: 900,
        peak_bph: 1000,
        best_streak_seconds: 180,
        top_block: "minecraft:netherrack",
        status: "ended",
      },
      {
        id: "ended-long",
        player_id: "player-1",
        session_key: "ended-long",
        world_id: "world-1",
        started_at: "2026-04-10T13:00:00.000Z",
        ended_at: "2026-04-10T13:45:00.000Z",
        active_seconds: 2700,
        total_blocks: 1200,
        average_bph: 1600,
        peak_bph: 1800,
        best_streak_seconds: 300,
        top_block: "minecraft:stone",
        status: "ended",
      },
    ]);

    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.id)).toEqual([
      "ended-long",
      "ended-exact-threshold",
    ]);
  });
});
