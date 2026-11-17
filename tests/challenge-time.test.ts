import assert from "node:assert/strict";
import { test } from "node:test";
import { challengeTime, formatDuration } from "../src/lib/challenge-time.ts";

test("overall time starts on the first unlock and stops at the final accepted answer", () => {
  const first = "2026-11-15T12:00:00.125Z";
  const second = "2026-11-15T12:01:00.500Z";
  const finished = "2026-11-15T12:02:15.750Z";
  const firstQuestion = { unlocked_at: first, completed_at: second };

  assert.equal(challengeTime([]), null);
  assert.deepEqual(challengeTime([{ unlocked_at: second, completed_at: null }, firstQuestion]), {
    startedAt: Date.parse(first), finishedAt: null,
  });
  assert.deepEqual(challengeTime([{ unlocked_at: second, completed_at: finished }, firstQuestion]), {
    startedAt: Date.parse(first), finishedAt: Date.parse(finished),
  });
});

test("completed times preserve milliseconds and running clocks display whole seconds", () => {
  assert.equal(formatDuration(3_725_007, true), "01:02:05.007");
  assert.equal(formatDuration(3_725_999), "01:02:05");
  assert.equal(formatDuration(-7), "00:00:00");
});
