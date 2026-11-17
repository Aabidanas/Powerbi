"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { field, type FormResult } from "@/lib/forms";
import { competitionConfig, requirePlayer } from "@/lib/supabase/access";
import { ownTeam, signedInDestination } from "@/lib/supabase/data";
import { supabaseAuth, supabaseCompetition } from "@/lib/supabase/repository";
import { supabaseServer } from "@/lib/supabase/server";

export async function signIn(_previous: FormResult, form: FormData): Promise<FormResult> {
  if (!await competitionConfig()) return { error: "Competition setup is still in progress. Try again later." };
  const { error } = await supabaseAuth.login(field(form, "email"), String(form.get("password") ?? ""));
  if (error) return { error: "Sign-in failed. Check your credentials and email confirmation." };
  const destination = await signedInDestination();
  if (!destination) return { error: "Could not verify your session. Try signing in again." };
  redirect(destination);
}

export async function signInWithGoogle(): Promise<FormResult> {
  const site = process.env.SITE_URL;
  if (!site || !await competitionConfig()) return { error: "Google sign-in is unavailable. Contact the organizer." };
  const client = await supabaseServer();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", site).href, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { error: "Could not start Google sign-in. Try again or contact the organizer." };
  redirect(data.url);
}

export async function createAccount(_previous: FormResult, form: FormData): Promise<FormResult> {
  if (!(await competitionConfig())?.registration_open) return { error: "Registration is closed." };
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");
  const passwordError = validateNewPassword(password, form);
  if (passwordError) return { error: passwordError };
  const site = process.env.SITE_URL;
  if (!site) return { error: "Account confirmation is not configured." };
  const result = await supabaseAuth.signup(email, password, new URL("/auth/confirm", site).href);
  if (result.error) return { error: signupErrorMessage(result.error, "create account") };
  if (result.data.session) redirect("/register");
  return { message: "Confirm your email, then create a team or join with a code." };
}

export async function signOut() {
  await supabaseAuth.logout();
  redirect("/login");
}

export async function enterTeam(_previous: FormResult, form: FormData): Promise<FormResult> {
  const { event } = await requirePlayer();
  const operation = field(form, "operation");
  const name = field(form, "name");
  if (!form.has("rules")) return { error: "Accept the championship rules to continue." };
  if (!name || name.length > 40) return { error: "Enter a display name between 1 and 40 characters." };
  const code = field(form, "code");
  const teamName = field(form, "team");
  if (operation !== "create" && operation !== "join") return { error: "Choose whether to create or join a team." };
  if (operation === "join" && (!code || code.length > 48)) {
    return { error: "Enter the team code from your captain." };
  }
  if (operation === "create" && (teamName.length < 2 || teamName.length > 40)) {
    return { error: "Enter a team name between 2 and 40 characters." };
  }
  try {
    if (operation === "create") await supabaseCompetition.createTeam(event.id, teamName, name);
    else await supabaseCompetition.joinTeam(event.id, code, name);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not register your team." };
  }
  redirect("/lobby");
}

export async function confirmEmail(_previous: FormResult, form: FormData): Promise<FormResult> {
  const token = field(form, "token");
  const type = field(form, "type");
  if (!token || (type !== "email" && type !== "signup" && type !== "recovery")) {
    return { error: "This link is incomplete. Request a fresh email." };
  }
  const { error } = await supabaseAuth.confirm(token, type);
  if (error) return { error: "This link is invalid or expired. Sign in if you already confirmed, or request a fresh email." };
  redirect(type === "recovery" ? "/reset-password" : "/register");
}

export async function resendConfirmation(_previous: FormResult, form: FormData): Promise<FormResult> {
  const email = field(form, "email");
  if (!email || !email.includes("@")) return { error: "Enter your account email." };
  const site = process.env.SITE_URL;
  if (!site) return { error: "Confirmation email is unavailable. Contact the organizer." };
  const client = await supabaseServer();
  const { error } = await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: new URL("/auth/confirm", site).href } });
  if (error) return { error: signupErrorMessage(error, "resend confirmation") };
  return { message: "If this account is awaiting confirmation, check its inbox for a fresh link." };
}

function signupErrorMessage(error: { code?: string; status?: number }, operation: string) {
  switch (error.code) {
    case "email_address_not_authorized":
      return "Confirmation emails are unavailable for this address. Ask the organizer to enable participant email delivery.";
    case "over_email_send_rate_limit":
      return "The confirmation email limit was reached. Try again later or contact the organizer.";
    case "over_request_rate_limit":
      return "Too many requests. Wait a few minutes before trying again.";
    case "email_address_invalid":
      return "Enter a valid email address and try again.";
    case "weak_password":
      return "Choose a stronger password with a mix of letters, numbers, and symbols.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "Account creation is unavailable. Contact the organizer.";
    default:
      console.warn("DATA QUEST Auth request failed", { operation, code: error.code, status: error.status });
      return error.status === 429
        ? "Too many requests. Wait a few minutes before trying again."
        : "The account request could not be completed. Try again or contact the organizer.";
  }
}

export async function beginChallenge(): Promise<FormResult> {
  const team = await ownTeam();
  if (!team) return { error: "Register your team first." };
  if (!team.isCaptain) return { error: "Only the captain can begin the challenge." };
  try {
    await supabaseCompetition.begin(team.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not open your challenge." };
  }
  revalidatePath("/lobby");
  revalidatePath("/arena");
  redirect("/arena");
}

export async function playCheckpoint(_previous: FormResult, form: FormData): Promise<FormResult> {
  const team = await ownTeam();
  if (!team) return { error: "Register your team first." };
  const checkpoint = field(form, "checkpoint");
  try {
    if (field(form, "operation") === "hint") {
      const hint = await supabaseCompetition.hint(team.id, checkpoint);
      revalidatePath("/arena");
      return { message: hint };
    }
    const result = await supabaseCompetition.submit(team.id, checkpoint, field(form, "answer"));
    if (!result.accepted) return { error: "That answer didn’t match. Your checkpoint timer is still running." };
    revalidatePath("/arena");
    revalidatePath("/leaderboard");
    return { message: `Checkpoint accepted · +${result.points} points` };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "DQ001") redirect("/arena?advanced=1");
    return { error: error instanceof Error ? error.message : "Could not process the checkpoint." };
  }
}

function validateNewPassword(password: string, form: FormData) {
  if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
    return "Choose a password with at least eight characters and at most 72 UTF-8 bytes.";
  }
  if (password !== form.get("confirmPassword")) return "Passwords must match.";
}

export async function sendPasswordReset(_previous: FormResult, form: FormData): Promise<FormResult> {
  const email = field(form, "email");
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  const site = process.env.SITE_URL;
  if (!site) return { error: "Password recovery is unavailable. Contact the organizer." };
  const { error } = await supabaseAuth.requestReset(email, new URL("/auth/confirm", site).href);
  if (error) return { error: "Could not send the reset email. Try again later." };
  return { message: "If an account exists for that address, you’ll receive a password reset email." };
}

export async function updatePassword(_previous: FormResult, form: FormData): Promise<FormResult> {
  const password = String(form.get("password") ?? "");
  const passwordError = validateNewPassword(password, form);
  if (passwordError) return { error: passwordError };
  try {
    const { error } = await supabaseAuth.resetPassword(password);
    if (error) return { error: "Could not save your password. Request a new reset link and try again." };
  } catch {
    return { error: "Open a valid password reset link before setting a new password." };
  }
  await supabaseAuth.logout();
  redirect("/login?password=updated");
}
