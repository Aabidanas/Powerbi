import type { Checkpoint } from "./challenges.ts";

const cases = [
  { slug: "retail", name: "Retail Intelligence", group: "Store", groups: ["Dubai Mall", "Marina", "Deira"], amount: "NetSalesAED", target: "SalesTargetAED", flag: "Returned", event: "returned", base: 110, increment: 17 },
  { slug: "fintech", name: "Fintech Sentinel", group: "Channel", groups: ["Mobile", "Web", "Branch"], amount: "TransactionAED", target: "RiskLimitAED", flag: "Flagged", event: "flagged", base: 280, increment: 31 },
  { slug: "supply", name: "Supply Chain Command", group: "Hub", groups: ["Jebel Ali", "Dubai South", "Sharjah"], amount: "FreightCostAED", target: "BudgetAED", flag: "Delayed", event: "delayed", base: 420, increment: 23 },
  { slug: "health", name: "Healthcare Telemetry", group: "Ward", groups: ["Emergency", "Medical", "Surgical"], amount: "OccupiedBeds", target: "StaffedBeds", flag: "Surge", event: "surge", base: 14, increment: 1 },
] as const;

export function starterChallenge(slug: string) {
  const caseIndex = cases.findIndex(item => item.slug === slug);
  if (caseIndex < 0) return null;
  const item = cases[caseIndex];
  const rows = Array.from({ length: 48 }, (_, i) => {
    const group = i % item.groups.length;
    const amount = item.base + ((i * 7 + caseIndex * 11) % 28 + group * 5) * item.increment;
    return {
      id: i + 1,
      date: `2026-10-${String(Math.floor(i / 3) + 1).padStart(2, "0")}`,
      group: item.groups[group],
      amount,
      target: amount + (item.slug === "health" ? 2 + (i % 6) : (i % 7 - 2) * item.increment),
      flag: Number((i + caseIndex * 2) % (caseIndex + 4) === 0),
    };
  });
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const flagged = rows.filter(row => row.flag === 1);
  const totalsByGroup = item.groups.map(group => ({
    group,
    total: rows.filter(row => row.group === group).reduce((sum, row) => sum + row.amount, 0),
  })).sort((a, b) => b.total - a.total);

  const checkpoint = (title: string, question: string, hint: string, expected: number | string, tolerance = 0): Checkpoint => ({
    title, question, hint, expected: String(expected), type: typeof expected === "number" ? "number" : "text", tolerance, variants: [],
  });
  const checkpoints = [
    checkpoint("Total recorded value", `What is the total of ${item.amount} across every row?`, `Sum ${item.amount} with all filters cleared.`, total),
    checkpoint("Count flagged records", `How many records are marked ${item.event} (${item.flag} = 1)?`, `Filter ${item.flag} to 1 and count the remaining rows.`, flagged.length),
    checkpoint("Find the leading group", `Which ${item.group} has the highest total ${item.amount}? Enter the name as it appears in the CSV.`, `Group by ${item.group}, sum ${item.amount} for each group, then sort descending.`, totalsByGroup[0].group),
    checkpoint("Calculate the event rate", `What percentage of rows have ${item.flag} = 1? Enter the number rounded to two decimal places. For example, enter 12.50 for 12.50 percent.`, "Divide the flagged row count by the full row count, then multiply by 100.", Number((flagged.length / rows.length * 100).toFixed(2)), 0.005),
  ];
  const csv = [
    ["RecordID", "Date", item.group, item.amount, item.target, item.flag],
    ...rows.map(row => [row.id, row.date, row.group, row.amount, row.target, row.flag]),
  ].map(row => row.join(",")).join("\r\n") + "\r\n";
  return { name: item.name, filename: `${item.slug}-starter.csv`, csv, checkpoints };
}
