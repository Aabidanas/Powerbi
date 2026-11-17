import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "./server";

async function signedIn() {
  const client = await supabaseServer();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to continue.");
  return client;
}

async function invoke<T>(fn: string, args: Record<string, unknown>) {
  const client = await signedIn();
  const { data, error } = await client.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as T;
}

export const supabaseAuth = {
  async signup(email: string, password: string, confirmationUrl: string) {
    const client = await supabaseServer();
    return client.auth.signUp({ email, password, options: { emailRedirectTo: confirmationUrl } });
  },
  async login(email: string, password: string) {
    const client = await supabaseServer();
    return client.auth.signInWithPassword({ email, password });
  },
  async logout() {
    const client = await supabaseServer();
    return client.auth.signOut();
  },
  async requestReset(email: string, confirmationUrl: string) {
    const client = await supabaseServer();
    return client.auth.resetPasswordForEmail(email, { redirectTo: confirmationUrl });
  },
  async confirm(tokenHash: string, type: EmailOtpType) {
    const client = await supabaseServer();
    return client.auth.verifyOtp({ token_hash: tokenHash, type });
  },
  async exchangeCode(code: string) {
    const client = await supabaseServer();
    return client.auth.exchangeCodeForSession(code);
  },
  async resetPassword(password: string) {
    const client = await signedIn();
    return client.auth.updateUser({ password });
  },
};

export const supabaseCompetition = {
  createTeam: (competition: string, team: string, name: string) =>
    invoke<string>("create_player_team", { p_competition: competition, p_team: team, p_display: name }),
  joinTeam: (competition: string, code: string, name: string) =>
    invoke<string>("join_player_team_with_code", { p_competition: competition, p_team_code: code, p_display: name }),
  ready: (team: string, ready: boolean) => invoke<void>("set_team_ready", { p_team: team, p_ready: ready }),
  assign: (team: string, challenge: string | null) => invoke<void>("assign_team", { p_team: team, p_challenge: challenge }),
  begin: (team: string) => invoke<void>("begin_team_challenge", { p_team: team }),
  hint: (team: string, checkpoint: string) => invoke<string>("reveal_checkpoint_hint", { p_team: team, p_checkpoint: checkpoint }),
  submit: (team: string, checkpoint: string, answer: string) => invoke<{accepted: false} | {accepted: true; points: number; seconds: number; next_checkpoint: string | null}>("submit_checkpoint", { p_team: team, p_checkpoint: checkpoint, p_answer: answer }),
  async rankings(competition: string) {
    const client = await supabaseServer();
    const { data, error } = await client.from("leaderboard_scores").select("team_id,team_name,track_slug,solved,points,solving_seconds")
      .eq("competition_id", competition).order("points", { ascending: false }).order("solving_time_us").order("team_id");
    if (error) throw new Error(error.message);
    return data;
  },
};
