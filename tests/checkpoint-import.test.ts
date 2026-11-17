import assert from "node:assert/strict";
import test from "node:test";
import { readCheckpointFile } from "../src/lib/checkpoint-import.ts";

const checkpoint = {
  title: "Total sales", question: "What is the total?", hint: "Sum the sales column.",
  type: "number", expected: "42", tolerance: 0.01,
};

test("organizer imports checkpoints in order and retains answer keys", async () => {
  const rows = [checkpoint, { ...checkpoint, title: "Measure", type: "dax", expected: "SUM(Data[Sales])" }];
  const file = new File([JSON.stringify(rows)], "checkpoints.json");
  assert.deepEqual(await readCheckpointFile(file), rows.map(row => ({ ...row, variants: [] })));
});

test("organizer sees which checkpoint fails validation", async () => {
  const file = new File([JSON.stringify([checkpoint, { ...checkpoint, expected: "forty-two" }])], "checkpoints.json");
  await assert.rejects(readCheckpointFile(file), /Checkpoint 2: Enter a numeric expected answer/);
});

test("checkpoint import accepts custom whole points and rejects invalid weights", async () => {
  const valid = new File([JSON.stringify([{ ...checkpoint, points: 175 }, { ...checkpoint, points: 0 }, checkpoint])], "checkpoints.json");
  assert.deepEqual((await readCheckpointFile(valid)).map(row => row.points), [175, 0, undefined]);

  for (const points of [-1, 2.5, "250", 2_147_483_648]) {
    const file = new File([JSON.stringify([{ ...checkpoint, points }])], "checkpoints.json");
    await assert.rejects(readCheckpointFile(file), /points must be a non-negative whole number/i);
  }
});

test("imports optional starter queries without dropping line breaks or changing older imports", async () => {
  const query = "EVALUATE\n  TOPN(5, Data)";
  const file = new File([JSON.stringify([checkpoint, { ...checkpoint, query }, { ...checkpoint, query: null }])], "checkpoints.json");
  const [original, withQuery, cleared] = await readCheckpointFile(file);
  assert.equal("query" in original, false);
  assert.equal(withQuery.query, query);
  assert.equal(cleared.query, null);
});
