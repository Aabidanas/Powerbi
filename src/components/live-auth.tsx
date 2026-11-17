import { createAccount, enterTeam, signIn, signInWithGoogle } from "@/app/live-actions";
import { LiveForm } from "./live-form";
import { Action, Badge, Card, Notice, PageTitle } from "./ui";

export function LiveAuth({ mode, confirmationFailed = false }: {
  mode: "login" | "signup"; confirmationFailed?: boolean;
}) {
  return <div className="shell auth-layout">
    <PageTitle tag="DATA QUEST · Power BI championship" title={mode === "login" ? "Welcome back, analyst." : "Assemble your squad"}>
      Each player signs in with their own account. Teams share the same challenge and score.
    </PageTitle>
    <Card className="auth-card">
      <Badge tone="yellow">Live competition</Badge>
      <h2>{mode === "login" ? "Log in" : "Create player account"}</h2>
      {confirmationFailed && <Notice error>That confirmation link could not be verified. Sign in or use a fresh confirmation email.</Notice>}
      <LiveForm action={signInWithGoogle} label="Continue with Google" secondary/>
      <LiveForm action={mode === "login" ? signIn : createAccount} label={mode === "login" ? "Log in" : "Create account"}>
        <label>Email<input name="email" required type="email" autoComplete="email"/></label>
        <label>Password<input name="password" required type="password" minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"}/></label>
        {mode === "signup" && <label>Confirm password<input name="confirmPassword" required type="password" autoComplete="new-password"/></label>}
      </LiveForm>
      <Action href={mode === "login" ? "/register" : "/login"} secondary>{mode === "login" ? "Register" : "Log in"}</Action>
      {mode === "login" && <Action href="/forgot-password" secondary>Forgot password?</Action>}
      {mode === "login" && confirmationFailed && <Action href="/confirm-email" secondary>Resend confirmation email</Action>}
    </Card>
  </div>;
}

export function TeamRegistration() {
  return <div className="shell page">
    <PageTitle tag="DATA QUEST · Player registration" title="Create or join a team">Play solo or link up to three player accounts in one team.</PageTitle>
    <div className="dashboard-two">
      <Card className="auth-card">
        <h2>Create a team</h2>
        <p>You’ll be the captain. Share your team code from the lobby.</p>
        <LiveForm action={enterTeam} operation="create" label="Create team">
          <label>Team name<input name="team" required minLength={2} maxLength={40}/></label>
          <TeamRegistrationFields/>
        </LiveForm>
      </Card>
      <Card className="auth-card">
        <h2>Join with a code</h2>
        <p>Enter the code your captain shared with you.</p>
        <LiveForm action={enterTeam} operation="join" label="Join team">
          <label>Team code<input name="code" placeholder="K7DM-4RXT" required maxLength={48} autoComplete="off" autoCapitalize="characters" spellCheck={false}/></label>
          <TeamRegistrationFields/>
        </LiveForm>
      </Card>
    </div>
  </div>;
}

function TeamRegistrationFields() {
  return <>
    <label>Your name<input name="name" required maxLength={40} autoComplete="name"/></label>
    <label className="checkbox"><input name="rules" type="checkbox" required/> I accept the <a href="/rules" target="_blank" rel="noreferrer">championship rules</a>.</label>
  </>;
}
