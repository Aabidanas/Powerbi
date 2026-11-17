import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./server";

export type EventRow = {
  id: string; name: string; registration_open: boolean;
  team_capacity: number; prize_aed: number;
};

export const competitionConfig = cache(async (): Promise<EventRow | null> => {
  const client = await supabaseServer();
  const { data, error } = await client.from("competitions")
    .select("id,name,registration_open,team_capacity,prize_aed")
    .eq("slug", process.env.DATA_QUEST_COMPETITION ?? "data-quest").maybeSingle();
  if (error?.code === "PGRST205") return null;
  if (error) throw new Error("The live competition could not be loaded.");
  return data;
});

export async function liveEvent() {
  const event = await competitionConfig();
  if (!event) throw new Error("Competition setup is still in progress.");
  return event;
}

export const liveAccess = cache(async () => {
  const client = await supabaseServer();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { role: "anonymous" } as const;
  const event = await competitionConfig();
  if (!event) return { role: "anonymous" } as const;
  const { data: admin, error: roleError } = await client.rpc("is_competition_admin", { p_competition: event.id });
  if (roleError) throw new Error("Could not verify competition access.");
  return { role: admin === true ? "admin" : "player", user: data.user, client, event } as const;
});

export async function requirePlayer() {
  const access = await liveAccess();
  if (access.role === "anonymous") redirect("/login");
  if (access.role === "admin") redirect("/admin");
  return access;
}

export async function requireAdmin() {
  const access = await liveAccess();
  if (access.role === "anonymous") redirect("/login");
  if (access.role !== "admin") redirect("/lobby");
  return access;
}
