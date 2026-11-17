"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/access";
import { field, type FormResult } from "@/lib/forms";
import { readCheckpointFile } from "@/lib/checkpoint-import";
import { starterChallenge } from "@/lib/starter-challenges";

export async function manageCompetition(_previous: FormResult, form: FormData): Promise<FormResult> {
  const { client, event } = await requireAdmin();
  const operation = field(form, "operation");
  const p_competition = event.id;
  const p_challenge = field(form, "challenge");
  const p_team = field(form, "team");

  try {
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const { error } = await client.rpc(name, args);
      if (error) throw new Error(error.message);
    };
    switch (operation) {
      case "registration":
        await rpc("set_registration_open", { p_competition, p_open: field(form, "open") === "true" });
        break;
      case "assign":
        await rpc("assign_team", { p_team, p_challenge: p_challenge || null });
        break;
      case "remove":
        await rpc("admin_remove_team", { p_competition, p_team });
        break;
      case "case":
        await rpc("admin_save_case", {
          p_competition, p_challenge, p_name: field(form, "name"),
          p_description: field(form, "description"), p_path: field(form, "path"),
        });
        break;
      case "checkpoint":
      case "checkpoint-new":
        await rpc(operation === "checkpoint-new" ? "admin_append_checkpoint" : "save_checkpoint", {
          ...(operation === "checkpoint-new" ? { p_competition } : { p_position: Number(field(form, "position")) }),
          p_challenge, p_title: field(form, "title"),
          p_question: field(form, "question"), p_type: field(form, "answerType"), p_expected: field(form, "expected"),
          p_tolerance: Number(field(form, "tolerance")), p_hint: field(form, "hint"),
          p_query: String(form.get("query") ?? "") || null,
          p_variants: field(form, "variants").split("\n").map(value => value.trim()).filter(Boolean),
        });
        break;
      case "checkpoint-import":
        await rpc("admin_import_checkpoints", { p_competition, p_challenge, p_questions: await readCheckpointFile(form.get("questions")) });
        break;
      case "starter":
      case "upload": {
        const { data: challenge, error: challengeError } = await client.from("challenges").select("id,slug,dataset_path,checkpoints(id)")
          .eq("competition_id", event.id).eq("id", p_challenge).maybeSingle();
        if (challengeError || !challenge) return { error: "Choose a challenge to attach this CSV." };
        const { count, error: scoreError } = await client.from("leaderboard_scores").select("team_id", { count: "exact", head: true })
          .eq("competition_id", event.id).eq("track_slug", challenge.slug);
        if (scoreError || count) return { error: "The dataset is locked once a team begins this track." };
        const starter = operation === "starter" ? starterChallenge(challenge.slug) : null;
        if (operation === "starter" && !starter) return { error: "No starter case is available for this track." };
        const alreadyAttached = starter && challenge.dataset_path.endsWith(`-${starter.filename}`);
        if (starter && (challenge.checkpoints.length > 0 ||
          (!alreadyAttached && challenge.dataset_path !== `${event.id}/${challenge.slug}.csv`))) {
          return { error: "This track already has content. Edit it using the dataset and checkpoint controls." };
        }
        const file = starter ? new File([starter.csv], starter.filename, { type: "text/csv" }) : form.get("dataset");
        if (!(file instanceof File) || file.size < 1 || file.size > 750_000 || !/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,80}[.]csv$/i.test(file.name)) {
          return { error: "Choose a CSV under 750 KB with a filename containing only letters, numbers, dots, hyphens or underscores." };
        }
        const content = await file.text();
        if (!content.trim() || content.includes("\0")) return { error: "Choose a non-empty CSV text file." };
        const path = `${event.id}/${crypto.randomUUID().slice(0, 8)}-${file.name.replace(/\.csv$/i, ".csv")}`;
        if (!alreadyAttached) {
          const { error } = await client.storage.from("competition-datasets").upload(path, file, { contentType: "text/csv" });
          if (error) throw new Error(error.message);
          try {
            await rpc("admin_attach_dataset", { p_competition, p_challenge, p_path: path });
          } catch (cause) {
            return { error: `CSV uploaded to ${path}, but could not be attached. ${(cause as Error).message}` };
          }
        }
        if (starter) await rpc("admin_import_checkpoints", { p_competition, p_challenge, p_questions: starter.checkpoints });
        break;
      }
      default:
        return { error: "Unknown organizer operation." };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The organizer operation failed." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/challenges");
  revalidatePath("/lobby");
  revalidatePath("/arena");
  revalidatePath("/leaderboard");
  return { message: "Saved." };
}
