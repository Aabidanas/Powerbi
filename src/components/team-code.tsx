"use client";

import { useRef, useState } from "react";

export function TeamCode({ code }: { code: string }) {
  const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted);
      setStatus("Copied.");
    } catch {
      input.current?.focus();
      input.current?.select();
      setStatus("Code selected. Use your device’s copy shortcut.");
    }
  }

  return <div className="form-stack">
    <label>Team code<input ref={input} value={formatted} readOnly spellCheck={false}/></label>
    <div className="action-row left">
      <button type="button" className="button secondary small-button" onClick={copy}>Copy team code</button>
      <span role="status">{status}</span>
    </div>
  </div>;
}
