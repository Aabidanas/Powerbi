"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { subscribeToRankings, subscribeToTeam } from "@/lib/supabase/browser";

export function LiveRefresh({ competition, team, interval = team ? 5000 : 15_000, arenaStarted }: {
  competition?: string; team?: string; interval?: number; arenaStarted?: boolean;
}) {
  const router = useRouter();
  const waitingForStart = useRef(arenaStarted === false);
  useEffect(() => {
    if (waitingForStart.current && arenaStarted) router.replace("/arena");
  }, [arenaStarted, router]);

  useEffect(() => {
    let pending: number | undefined;
    const refresh = () => {
      if (pending !== undefined) return;
      pending = window.setTimeout(() => {
        pending = undefined;
        router.refresh();
      }, 75);
    };
    const onVisible = () => { if (!document.hidden) refresh(); };
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, interval);
    const unsubscribeRankings = competition ? subscribeToRankings(competition, refresh) : undefined;
    const unsubscribeTeam = team ? subscribeToTeam(team, refresh) : undefined;
    if (team) document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(pending);
      window.clearInterval(timer);
      if (team) document.removeEventListener("visibilitychange", onVisible);
      unsubscribeRankings?.();
      unsubscribeTeam?.();
    };
  }, [router, competition, team, interval]);
  return null;
}
