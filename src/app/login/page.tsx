import { redirect } from "next/navigation";
import { LiveAuth } from "@/components/live-auth";
import { Notice } from "@/components/ui";
import { competitionConfig } from "@/lib/supabase/access";
import { signedInDestination } from "@/lib/supabase/data";
export const metadata = { title: "Login" };
export default async function Page({ searchParams }: PageProps<"/login">) {
  const destination = await signedInDestination();
  if (destination) redirect(destination);
  const params = await searchParams;
  return <>
    {!await competitionConfig() && <div className="shell"><Notice>Competition setup is still in progress.</Notice></div>}
    {params.password === "updated" && <div className="shell"><Notice>Password updated. Log in with your new password.</Notice></div>}
    {params.google === "failed" && <div className="shell"><Notice error>Google sign-in didn’t finish. Try again from this browser.</Notice></div>}
    <LiveAuth mode="login" confirmationFailed={params.confirmation === "failed"}/>
  </>;
}
