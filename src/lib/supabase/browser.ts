import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createBrowserClient(url, key);
}

export function subscribeToRankings(competition: string, refresh: () => void) {
  const client = supabaseBrowser();
  const channel = client.channel(`rankings:${competition}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard_scores", filter: `competition_id=eq.${competition}` }, refresh)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

let nextTeamSubscription = 0;

export function subscribeToTeam(team: string, refresh: () => void) {
  const client = supabaseBrowser();
  const filter = `team_id=eq.${team}`;
  const channel = client.channel(`team:${team}:${++nextTeamSubscription}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_members", filter }, refresh)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkpoint_unlocks", filter }, refresh)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "checkpoint_unlocks", filter }, refresh)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "hint_usage", filter }, refresh)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}
