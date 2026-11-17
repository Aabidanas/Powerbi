"use client";

import { manageCompetition } from "@/app/admin/actions";
import type { FormResult } from "@/lib/forms";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LiveForm } from "./live-form";

export function UploadDataset({ competition, challenge }: { competition: string; challenge: string }) {
  async function upload(_previous: FormResult, form: FormData): Promise<FormResult> {
    const file = form.get("dataset");
    if (!(file instanceof File) || !file.size) return { error: "Choose a non-empty CSV or ZIP file." };
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    if (extension !== "zip" && extension !== "csv") return { error: "Choose a CSV or ZIP file." };

    if (extension === "zip") {
      const signature = await file.slice(0, 4).arrayBuffer();
      if (signature.byteLength !== 4 || new DataView(signature).getUint32(0) !== 0x504b0304) {
        return { error: "Choose a ZIP archive containing at least one file." };
      }
    } else {
      const content = await file.text();
      if (!content.trim() || content.includes("\0")) return { error: "Choose a non-empty CSV text file." };
    }

    const name = file.name.slice(0, -(extension.length + 1)).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "dataset";
    const path = `${competition}/${crypto.randomUUID()}-${name}.${extension}`;
    try {
      const { error } = await supabaseBrowser().storage.from("competition-datasets").upload(path, file, {
        contentType: extension === "zip" ? "application/zip" : "text/csv",
      });
      if (error) return { error: error.message };
      form.delete("dataset");
      form.set("path", path);
      const result = await manageCompetition({}, form);
      if (result.error) return { error: `File uploaded to ${path}, but could not be attached. ${result.error}` };
      return result;
    } catch {
      return { error: "The dataset upload could not be completed. Try again." };
    }
  }

  return <LiveForm action={upload} operation="upload" label="Upload and attach dataset">
    <input type="hidden" name="challenge" value={challenge}/>
    <label>Dataset file<input name="dataset" type="file" accept=".csv,.zip,text/csv,application/zip,application/x-zip-compressed" required/></label>
    <p>Upload one CSV, or a ZIP containing multiple CSVs.</p>
  </LiveForm>;
}
