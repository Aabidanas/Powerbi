import { sendPasswordReset } from "@/app/live-actions";
import { LiveForm } from "@/components/live-form";
import { Action, Card, Notice, PageTitle } from "@/components/ui";

export default async function Page({ searchParams }: PageProps<"/forgot-password">) {
  return <div className="shell page">
    <PageTitle tag="Account access" title="Reset your password"/>
    <Card className="panel message-card">
      {(await searchParams).link === "expired" && <Notice error>That reset link is invalid or expired. Request a new one below.</Notice>}
      <LiveForm action={sendPasswordReset} label="Send reset link">
        <label>Email<input name="email" type="email" required autoComplete="email"/></label>
      </LiveForm>
      <Action href="/login" secondary>Back to login</Action>
    </Card>
  </div>;
}
