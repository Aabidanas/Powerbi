import { writeFile } from "node:fs/promises";
import { starterChallenge } from "../src/lib/starter-challenges.ts";
import { validateCheckpoint } from "../src/lib/checkpoint-import.ts";

const sections = ["retail", "fintech", "supply", "health"].map(slug => {
  const { name, filename, csv, checkpoints } = starterChallenge(slug);
  const [, ...rows] = csv.trim().split(/\r?\n/).map(row => row.split(","));
  if (rows.length !== 48 || checkpoints.length !== 5) throw new Error(`Invalid starter case for ${slug}`);
  const sum = (items, column) => items.reduce((total, row) => total + Number(row[column]), 0);
  const events = sum(rows, 5);
  const groups = [...new Set(rows.map(row => row[2]))].sort((a, b) =>
    sum(rows.filter(row => row[2] === b), 3) - sum(rows.filter(row => row[2] === a), 3)
  );
  const expected = [sum(rows, 3), events, groups[0], Number((100 * events / rows.length).toFixed(2)), sum(rows, 3) - sum(rows, 4)];
  return [
    `## ${name}`,
    "",
    `Dataset file is \`${filename}\`. Each row is a synthetic record.`,
    "",
    "| Checkpoint | Question | Enter this answer | How to verify |",
    "| --- | --- | --- | --- |",
    ...checkpoints.map((raw, index) => {
      const checkpoint = validateCheckpoint(raw);
      if (checkpoint.expected !== String(expected[index])) throw new Error(`Answer mismatch for ${slug} checkpoint ${index + 1}`);
      const answer = index === 3 ? Number(checkpoint.expected).toFixed(2) : checkpoint.expected;
      return `| ${index + 1} · ${checkpoint.title} | ${checkpoint.question} | \`${answer}\` | ${checkpoint.hint} |`;
    }),
    "",
  ].join("\n");
});

const intro = `# DATA QUEST starter challenge cheat sheet

Organizer testing copy. Keep this file separate from the datasets shared with players.

1. Open the Challenge Library and select **Load starter dataset and questions** on each empty track.
2. Assign a test team to the track you want to check. Sign in as its captain, select **Begin challenge**, then download the assigned CSV.
3. Submit the values in order. Try an incorrect value first and confirm that the checkpoint stays open. Reveal a hint and confirm that its point deduction applies.
4. After the final correct answer, check the team’s score and solved checkpoint count on the leaderboard.

Testing with a real team locks the track’s content. Before editing the tested track, have the Supabase project owner remove the test team and its progress.
`;

await writeFile(new URL("../starter-challenge-cheatsheet.md", import.meta.url), [intro, ...sections].join("\n"));
console.log("Verified 20 answers against the generated CSV datasets.");
