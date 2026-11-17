import Link from "next/link";
import { signOut } from "@/app/live-actions";
import { liveAccess } from "@/lib/supabase/access";
import { Brand } from "./site-shell";
import { Action, Status } from "./ui";

export async function LiveNavbar() {
  const { role } = await liveAccess();
  const links = role === "admin"
    ? [["Home", "/"], ["Console", "/admin"], ["Leaderboard", "/leaderboard"]]
    : [["Home", "/"], ["Lobby", "/lobby"], ["Arena", "/arena"], ["Leaderboard", "/leaderboard"]];
  return <header className="site-header"><div className="header-inner live-header">
    <Brand/>
    <Status>{role === "admin" ? "Organizer" : "Live competition"}</Status>
    <nav className="site-nav live-nav" aria-label="Main navigation">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
    <div className="header-actions">{role === "anonymous"
      ? <><Link className="login-link" href="/login">Log in</Link><Action href="/register" className="small-button">Register</Action></>
      : <form action={signOut}><button className="button secondary small-button">Log out</button></form>}</div>
  </div></header>;
}
