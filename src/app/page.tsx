import { LandingContent } from "@/components/landing";
import { competitionConfig, liveAccess } from "@/lib/supabase/access";
import { competitionCatalogue, liveRankings } from "@/lib/supabase/data";

export default async function Home() {
  const [event, access] = await Promise.all([competitionConfig(), liveAccess()]);
  const [catalogue, rankings] = event ? await Promise.all([competitionCatalogue(event.id), liveRankings()]) : [[], []];
  const tracks = catalogue.map(({slug, name, description}) => ({id: slug, name, description}));
  const leaders = rankings.slice(0, 3).map(row => ({id: row.team_id, name: row.team_name, points: row.points, solved: row.solved, seconds: Math.floor(row.solving_time_us / 1_000_000)}));
  return <LandingContent tracks={tracks} leaders={leaders}
    arenaHref={access.role === "admin" ? "/admin" : access.role === "player" ? "/arena" : "/login"}
    registrationOpen={event?.registration_open ?? false}/>;
}
