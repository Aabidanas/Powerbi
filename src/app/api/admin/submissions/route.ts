import { liveAccess } from "@/lib/supabase/access";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const access = await liveAccess();
  if (access.role !== "admin") {
    return Response.json({ error: "Organizer access required." }, { status: access.role === "anonymous" ? 401 : 403, headers });
  }
  const { data, error } = await access.client.rpc("admin_recent_submissions", { p_competition: access.event.id });
  if (error) return Response.json({ error: "Could not load submissions." }, { status: error.code === "42501" ? 403 : 500, headers });
  return Response.json(data, { headers });
}
