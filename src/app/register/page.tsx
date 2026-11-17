import { redirect } from "next/navigation";
import { LiveAuth, TeamRegistration } from "@/components/live-auth";
import { Notice, PageTitle } from "@/components/ui";
import { competitionConfig, liveAccess } from "@/lib/supabase/access";
import { ownTeam } from "@/lib/supabase/data";
export const metadata = { title: "Register" };
export default async function Page() {
  const [access, event] = await Promise.all([liveAccess(), competitionConfig()]);
  if (access.role === "admin") redirect("/admin");
  if (access.role === "player" && await ownTeam()) redirect("/lobby");
  if (!event?.registration_open) {
    return <div className="shell page"><PageTitle tag="Live competition" title="Team registration"/><Notice>{event ? "Registration is closed." : "Competition setup is still in progress."}</Notice></div>;
  }
  if (access.role === "anonymous") return <LiveAuth mode="signup"/>;
  return <TeamRegistration/>;
}
