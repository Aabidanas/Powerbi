"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/challenge-time";

export function ElapsedClock({ startedAt, finishedAt = null, sampledAt, label, precise = false }: {
  startedAt: number; finishedAt?: number | null; sampledAt: number; label: string; precise?: boolean;
}) {
  const [now, setNow] = useState(sampledAt);

  useEffect(() => {
    if (finishedAt !== null) return;

    // Advance from the server's sample using a monotonic browser clock.
    const receivedAt = performance.now();
    const tick = () => {
      const estimatedNow = sampledAt + performance.now() - receivedAt;
      setNow(previous => Math.max(previous, estimatedNow));
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [sampledAt, finishedAt]);

  return <span className="elapsed-time" role="timer" aria-label={label}>{formatDuration((finishedAt ?? Math.max(now, sampledAt)) - startedAt, precise && finishedAt !== null)}</span>;
}
