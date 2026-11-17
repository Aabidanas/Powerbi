import Link from "next/link";
import { BarChart3, BookOpen } from "lucide-react";
import { Badge, Status } from "./ui";

export function Brand() {
  return <Link href="/" className="brand" aria-label="Data Quest home">
    <span className="icon-tile yellow"><BarChart3 size={17}/></span>
    <span><strong>DATA QUEST <Badge tone="yellow">Power BI</Badge></strong><small>BITS PILANI DUBAI · TECH CLUB</small></span>
  </Link>;
}

export function Footer() {
  return <footer className="site-footer">
    <div className="shell footer-inner">
      <Status>System operational</Status>
      <span>Microsoft Tech Club · BITS Pilani Dubai Campus</span>
      <Link href="/rules"><BookOpen size={14}/> Rules &amp; dataset docs</Link>
      <Badge tone="yellow">Power BI Pro</Badge>
    </div>
  </footer>;
}
