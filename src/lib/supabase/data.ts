import "server-only";

import { cache } from "react";
import { liveAccess, liveEvent, requireAdmin, requirePlayer } from "./access";
import { supabaseServer } from "./server";

export const ownTeam = cache(async () => {
  const { client, event, user } = await requirePlayer();
  const { data, error } = await client.from("teams")
    .select("id,name,captain_id,teammate_names,team_members!inner(user_id)")
    .eq("competition_id", event.id).eq("team_members.user_id", user.id).maybeSingle();
  if (error) throw new Error("Could not load your team.");
  return data && { ...data, isCaptain: data.captain_id === user.id };
});

type RosterMember = { user_id: string; profiles: { display_name: string } | null };

export async function teamLobbyDetails(team: string, showCode: boolean) {
  const { client, event } = await requirePlayer();
  const [roster, code] = await Promise.all([
    client.from("team_members").select("user_id,profiles(display_name)").eq("team_id", team)
      .overrideTypes<RosterMember[], { merge: false }>(),
    showCode && event.registration_open
      ? client.from("team_join_codes").select("short_code").eq("team_id", team).maybeSingle()
      : null,
  ]);
  if (roster.error || code?.error) throw new Error("Could not load the team lobby.");
  return { members: roster.data, code: roster.data.length < 3 ? code?.data?.short_code : undefined };
}

export async function signedInDestination() {
  const access = await liveAccess();
  if (access.role === "admin") return "/admin";
  if (access.role === "player") return await ownTeam() ? "/lobby" : "/register";
  return null;
}

export const liveRankings = cache(async () => {
  const event = await liveEvent();
  const client = await supabaseServer();
  const [{ data, error }, tracks] = await Promise.all([
    client.from("leaderboard_scores")
      .select("team_id,team_name,track_slug,solved,points,solving_time_us")
      .eq("competition_id", event.id).order("points", { ascending: false }).order("solving_time_us").order("team_id"),
    competitionCatalogue(event.id),
  ]);
  if (error) throw new Error("Could not load the leaderboard.");
  const trackNames = new Map(tracks.map(track => [track.slug, track.name]));
  return data.map(row => ({ ...row, trackName: trackNames.get(row.track_slug) ?? null }));
});

export const competitionCatalogue = cache(async (competition: string) => {
  const client = await supabaseServer();
  const { data, error } = await client.rpc("competition_catalogue", { p_competition: competition });
  if (error) throw new Error("Could not load the challenge catalogue.");
  return data as { slug: string; name: string; description: string }[];
});

export async function currentTeamId() {
  const access = await liveAccess();
  return access.role === "player" ? (await ownTeam())?.id : undefined;
}

export async function playerMission(team: string) {
  const { client } = await requirePlayer();
  const [assignment, progress, scores, hintUsage] = await Promise.all([
    client.from("team_assignments").select("challenge_id").eq("team_id", team).maybeSingle(),
    client.from("checkpoint_unlocks").select("checkpoint_id,unlocked_at,completed_at").eq("team_id", team),
    client.from("scoring_records").select("checkpoint_id,points,elapsed_seconds").eq("team_id", team),
    client.from("hint_usage").select("checkpoint_id").eq("team_id", team),
  ]);
  if (assignment.error || progress.error || scores.error || hintUsage.error) throw new Error("Could not load your mission.");
  if (!assignment.data) return null;
  const [challenge, questions] = await Promise.all([
    client.from("challenges").select("id,name,slug,description").eq("id", assignment.data.challenge_id).single(),
    client.from("checkpoints").select("id,position,title,question,answer_type,starter_query,base_points")
      .eq("challenge_id", assignment.data.challenge_id).order("position"),
  ]);
  if (challenge.error || questions.error) throw new Error("Could not load the challenge.");
  return {
    challenge: challenge.data, questions: questions.data, progress: progress.data, scores: scores.data,
    hints: new Set(hintUsage.data.map(row => row.checkpoint_id)),
    sampledAt: Date.now(),
  };
}

export async function acceptedCheckpointAnswer(team: string, checkpoint: string) {
  const { client } = await requirePlayer();
  const { data, error } = await client.from("submissions").select("answer")
    .eq("team_id", team).eq("checkpoint_id", checkpoint).eq("accepted", true).maybeSingle();
  if (error) throw new Error("Could not load your submitted answer.");
  return data?.answer ?? null;
}

type OrganizerTeam = {
  id: string;
  name: string;
  seat_count: number;
  teammate_names: string[];
  captain_id: string;
  team_members: RosterMember[];
  checkpoint_unlocks: {
    unlocked_at: string;
    completed_at: string | null;
    checkpoints: { position: number; title: string } | null;
  }[];
};

export async function organizerTeams() {
  const { event, client } = await requireAdmin();
  const { data, error } = await client.from("teams")
    .select("id,name,seat_count,teammate_names,captain_id,team_members(user_id,profiles(display_name)),checkpoint_unlocks(unlocked_at,completed_at,checkpoints(position,title))")
    .eq("competition_id", event.id).order("name")
    .overrideTypes<OrganizerTeam[], { merge: false }>();
  if (error) throw new Error("Could not load the organizer teams.");
  return { teams: data, sampledAt: Date.now() };
}
