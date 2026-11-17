import { confirmEmail, resendConfirmation } from "@/app/live-actions";
import { LiveForm } from "@/components/live-form";
import { Action, Card, PageTitle } from "@/components/ui";

export const metadata = { referrer: "no-referrer" as const };

export default async function Page({ searchParams }: PageProps<"/confirm-email">) {
  const { token_hash, type } = await searchParams;
  const hasToken = typeof token_hash === "string" && typeof type === "string";
  const recovery = type === "recovery";
  return <div className="shell page">
    <PageTitle tag="Account access" title={recovery ? "Continue password reset" : "Confirm your email"}/>
    <Card className="panel message-card">
      {hasToken && <LiveForm action={confirmEmail} label={recovery ? "Continue password reset" : "Confirm email"}>
        <input type="hidden" name="token" value={token_hash}/>
        <input type="hidden" name="type" value={type}/>
      </LiveForm>}
      {recovery ? <Action href="/forgot-password" secondary>Request a fresh reset link</Action> :
        <div className="compact"><LiveForm action={resendConfirmation} label="Send confirmation email" secondary>
          <label>Account email<input type="email" name="email" required autoComplete="email"/></label>
        </LiveForm></div>}
      <Action href="/login" secondary>Back to login</Action>
    </Card>
  </div>;
}
