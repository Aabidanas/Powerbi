import Link from "next/link";
import { ArrowRight, Store, Shield, Truck, Hospital } from "lucide-react";
import type { ReactNode } from "react";
export { Popup } from "./ui/dialog";

export const trackIcons = { retail: Store, fintech: Shield, supply: Truck, health: Hospital };

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "", className = "" }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={`badge ${tone} ${className}`}>{children}</span>;
}

export function Action({ href, children, secondary = false, arrow = false, className = "" }: { href: string; children: ReactNode; secondary?: boolean; arrow?: boolean; className?: string }) {
  return <Link className={`button ${secondary ? "secondary" : ""} ${className}`} href={href}>{children}{arrow && <ArrowRight size={15}/>}</Link>;
}

export function Status({ children }: { children: ReactNode }) {
  return <Badge tone="mint"><i className="dot"/>{children}</Badge>;
}

export function PageTitle({ tag, title, children }: { tag: string; title: string; children?: ReactNode }) {
  return <div className="page-title"><Badge tone="yellow">{tag}</Badge><h1>{title}</h1>{children && <p>{children}</p>}</div>;
}

export function Progress({ solved, total = 5, active = true }: { solved: number; total?: number; active?: boolean }) {
  return <span className="pipeline" role="img" aria-label={`${solved} of ${total} checkpoints complete`}>
    {Array.from({length: total}, (_, i) => <i key={i} className={i < solved ? "passed" : i === solved && active ? "current" : ""}/>)}
  </span>;
}

export function Metric({ value, label, tone = "" }: { value: ReactNode; label: string; tone?: string }) {
  return <Card className={`metric ${tone}`}><strong>{value}</strong><span>{label}</span></Card>;
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}
