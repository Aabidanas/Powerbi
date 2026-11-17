import { redirect } from "next/navigation";
import { updatePassword } from "@/app/live-actions";
import { LiveForm } from "@/components/live-form";
import { Card, PageTitle } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Page() {
  const client = await supabaseServer();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/forgot-password");
  return <div className="shell page">
    <PageTitle tag="Account access" title="Choose a new password"/>
    <Card className="panel message-card">
      <LiveForm action={updatePassword} label="Save new password">
        <label>New password<input name="password" type="password" required minLength={8} autoComplete="new-password"/></label>
        <label>Confirm password<input name="confirmPassword" type="password" required autoComplete="new-password"/></label>
      </LiveForm>
    </Card>
  </div>;
}
