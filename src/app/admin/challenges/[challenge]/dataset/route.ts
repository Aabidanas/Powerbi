import { datasetFileName, type AttachedDataset } from "@/lib/datasets";
import { liveAccess } from "@/lib/supabase/access";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: RouteContext<"/admin/challenges/[challenge]/dataset">) {
  const access = await liveAccess();
  if (access.role !== "admin") {
    return new Response("Organizer access required.", { status: access.role === "anonymous" ? 401 : 403, headers });
  }
  const { challenge } = await context.params;
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(challenge)) {
    return new Response("Dataset unavailable.", { status: 404, headers });
  }
  const { data, error } = await access.client.rpc("admin_attached_datasets", {
    p_competition: access.event.id, p_challenge: challenge,
  }).maybeSingle<AttachedDataset>();
  if (error) return new Response("Could not load dataset details.", { status: 500, headers });
  if (!data) return new Response("Dataset unavailable.", { status: 404, headers });

  const file = await access.client.storage.from("competition-datasets")
    .createSignedUrl(data.object_path, 60, { download: datasetFileName(data) });
  if (file.error) return new Response("Dataset unavailable.", { status: 404, headers });
  return new Response(null, { status: 302, headers: { ...headers, Location: file.data.signedUrl } });
}
