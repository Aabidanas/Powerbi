"use client";

import { useEffect, useState } from "react";
import { Badge, Notice } from "./ui";

type Submission = { id: string; team_name: string; checkpoint: string; accepted: boolean; submitted_at: string; points: number | null };
const time = new Intl.DateTimeFormat("en-AE", { timeStyle: "medium", timeZone: "Asia/Dubai" });

export function AdminSubmissions() {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let pending: AbortController | undefined;
    let mounted = true;
    async function refresh() {
      if (pending || !mounted) return;
      const request = new AbortController();
      pending = request;
      try {
        const result = await fetch("/api/admin/submissions", { signal: request.signal, cache: "no-store" });
        if (!result.ok) {
          if (result.status === 401 || result.status === 403) setRows(null);
          throw new Error("Submission monitoring is unavailable.");
        }
        const submissions = await result.json() as Submission[];
        if (mounted) { setRows(submissions); setError(""); }
      } catch (cause) {
        if (mounted && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not refresh submissions.");
      } finally { pending = undefined; }
    }
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    return () => { mounted = false; pending?.abort(); window.clearInterval(timer); };
  }, []);
  if (error) return <Notice error>{error}</Notice>;
  if (rows === null) return <p>Loading submissions…</p>;
  if (!rows.length) return <p>No submissions yet.</p>;
  return <div className="table-scroll" tabIndex={0} aria-label="Scrollable submissions"><table>
    <thead><tr><th scope="col">Time (GST)</th><th scope="col">Team</th><th scope="col">Checkpoint</th><th scope="col">Outcome</th><th scope="col">Score</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}><td><time dateTime={row.submitted_at}>{time.format(new Date(row.submitted_at))}</time></td><td>{row.team_name}</td><td>{row.checkpoint}</td><td><Badge tone={row.accepted ? "mint" : ""}>{row.accepted ? "Accepted" : "Incorrect"}</Badge></td><td>{row.points ?? "—"}</td></tr>)}</tbody>
  </table></div>;
}
