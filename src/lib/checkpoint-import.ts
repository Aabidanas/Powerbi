import type { Checkpoint } from "./challenges.ts";

export function validateCheckpoint(value: unknown): Checkpoint {
  if (!value || typeof value !== "object") throw new Error("Enter a complete checkpoint.");
  const input = value as Record<string, unknown>;
  const required = (key: string, limit: number) => {
    const text = typeof input[key] === "string" ? input[key].trim() : "";
    if (!text || text.length > limit) throw new Error(`Enter ${key} (up to ${limit} characters).`);
    return text;
  };
  const { type, tolerance = 0, variants = [] } = input;
  if (type !== "number" && type !== "text" && type !== "dax") throw new Error("Answer type must be number, text, or dax.");
  if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0) throw new Error("Tolerance must be a non-negative number.");
  if (!Array.isArray(variants) || variants.some(item => typeof item !== "string" || item.length > 500)) throw new Error("Variants must be a list of text answers.");
  const { query } = input;
  if (query !== undefined && query !== null && (typeof query !== "string" || query.length > 4000 || query.includes("\0"))) {
    throw new Error("Enter a query of up to 4000 characters or leave it blank.");
  }
  const expected = required("expected", 500);
  if (type === "number" && (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(expected) || !Number.isFinite(Number(expected)))) {
    throw new Error("Enter a numeric expected answer without commas.");
  }
  return { title: required("title", 80), question: required("question", 500), hint: required("hint", 500), expected, type, tolerance, variants: variants.map(item => item.trim()).filter(Boolean),
    ...(query === undefined ? {} : { query: typeof query === "string" && query.trim() ? query : null }),
  };
}

export async function readCheckpointFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".json") || !file.size || file.size > 250_000) {
    throw new Error("Choose a checkpoint JSON file up to 250 KB.");
  }
  let rows: unknown;
  try { rows = JSON.parse((await file.text()).replace(/^\uFEFF/, "")); }
  catch { throw new Error("The file is not valid JSON. Use the checkpoint template as a guide."); }
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error("Provide a JSON list of 1–100 checkpoints in order.");
  return rows.map((row, index) => {
    try { return validateCheckpoint(row); }
    catch (error) { throw new Error(`Checkpoint ${index + 1}: ${(error as Error).message}`); }
  });
}

export const CHECKPOINT_TEMPLATE = JSON.stringify([
  { title: "Total sales", question: "What is the total of the Sales column?", hint: "Add every value in the Sales column.", type: "number", expected: "1200", tolerance: 0, variants: [], query: null },
], null, 2);
