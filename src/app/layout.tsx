import type { Metadata } from "next";
import "@fontsource/anton/latin-400.css";
import "@fontsource-variable/space-grotesk";
import "./globals.css";
import { Footer } from "@/components/site-shell";
import { LiveNavbar } from "@/components/live-shell";

export const metadata: Metadata = {
  title: { default: "DATA QUEST · Power BI Championship", template: "%s · DATA QUEST" },
  description: "Turn data into victory at the Microsoft Tech Club Power BI Championship, BITS Pilani Dubai.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>
    <a href="#main" className="skip-link">Skip to content</a>
    <LiveNavbar/>
    <main id="main">{children}</main>
    <Footer/>
  </body></html>;
}
