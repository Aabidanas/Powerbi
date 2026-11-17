"use client";

import { useActionState, type ReactNode } from "react";
import type { LiveFormAction } from "@/lib/forms";
import { Notice } from "./ui";

export function LiveForm({ action, children, label, operation, compact = false, secondary = false, disabled = false }: {
  action: LiveFormAction; children?: ReactNode; label: string; operation?: string; compact?: boolean;
  secondary?: boolean; disabled?: boolean;
}) {
  const [result, submit, pending] = useActionState(action, {});
  return <form action={submit} className="form-stack">
    {operation && <input type="hidden" name="operation" value={operation}/>}
    {children}
    {result.error && <Notice error>{result.error}</Notice>}
    {result.message && <Notice>{result.message}</Notice>}
    <button type="submit" className={`button ${compact ? "small-button" : ""} ${secondary ? "secondary" : ""}`} disabled={pending || disabled}>{pending ? "Working…" : label}</button>
  </form>;
}
