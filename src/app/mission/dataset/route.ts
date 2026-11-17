import { liveAccess } from "@/lib/supabase/access";
import { ownTeam } from "@/lib/supabase/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await liveAccess();
  if (access.role !== "player") return new Response(null, { status: access.role === "anonymous" ? 401 : 403 });
  const team = await ownTeam();
  if (!team) return new Response(null, { status: 404 });
  const { data, error } = await access.client.from("team_assignments")
    .select("challenges(dataset_path)").eq("team_id", team.id).maybeSingle();
  const path = (data?.challenges as unknown as {dataset_path: string} | undefined)?.dataset_path;
  if (error || !path) return new Response("Dataset unavailable", { status: 404 });
  const extension = path.toLowerCase().endsWith(".zip") ? "zip" : "csv";
  const file = await access.client.storage.from("competition-datasets")
    .createSignedUrl(path, 60, { download: `data-quest.${extension}` });
  if (file.error) return new Response("Dataset unavailable", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: file.data.signedUrl, "Cache-Control": "private, no-store" } });
}
