type CheckpointTime = { unlocked_at: string; completed_at: string | null };

export function challengeTime(checkpoints: CheckpointTime[]) {
  if (!checkpoints.length) return null;

  const startedAt = Math.min(...checkpoints.map(row => Date.parse(row.unlocked_at)));
  const completions = checkpoints.map(row => row.completed_at);
  const finishedAt = completions.every(stamp => stamp !== null)
    ? Math.max(...completions.map(stamp => Date.parse(stamp)))
    : null;
  return { startedAt, finishedAt };
}

export function formatDuration(milliseconds: number, precise = false) {
  const elapsed = Math.max(0, Math.floor(milliseconds));
  const seconds = Math.floor(elapsed / 1000);
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");

  return precise ? `${time}.${String(elapsed % 1000).padStart(3, "0")}` : time;
}
