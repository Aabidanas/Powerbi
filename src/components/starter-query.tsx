"use client";

import { useRef, useState } from "react";

export function StarterQuery({ query }: { query: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(query);
      setStatus("Copied.");
    } catch {
      field.current?.focus();
      field.current?.select();
      setStatus("Query selected. Use your device’s copy shortcut.");
    }
  }

  return <details className="starter-query">
    <summary>Show query <span className="muted">(free)</span></summary>
    <textarea ref={field} aria-label="Starter query" readOnly value={query} rows={5} spellCheck={false} wrap="off"/>
    <div className="action-row left">
      <button type="button" className="button secondary small-button" onClick={copy}>Copy query</button>
      <span role="status">{status}</span>
    </div>
  </details>;
}
