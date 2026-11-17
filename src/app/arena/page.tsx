import { LiveArena } from "@/components/live-player";
export const metadata = { title: "Competition Arena" };
export default async function Page({ searchParams }: PageProps<"/arena">) {
  const { checkpoint, advanced } = await searchParams;
  return <LiveArena reviewPosition={typeof checkpoint === "string" ? checkpoint : undefined} teammateAdvanced={advanced === "1"}/>;
}
