import { Activity, Radio, Users } from "lucide-react";
import { manageCompetition } from "@/app/admin/actions";
import { challengeTime } from "@/lib/challenge-time";
import { requireAdmin } from "@/lib/supabase/access";
import { liveRankings, organizerTeams } from "@/lib/supabase/data";
import { AdminSubmissions } from "./admin-submissions";
import { ElapsedClock } from "./elapsed-clock";
import { LiveForm } from "./live-form";
import { LiveScoreTable } from "./live-player";
import { LiveRefresh } from "./live-refresh";
import { Action, Badge, Card, Metric, PageTitle, Popup } from "./ui";

export async function LiveAdmin() {
  const { event, client } = await requireAdmin();
  
  const [{ teams, sampledAt }, cases, assignments, scores] = await Promise.all([
    organizerTeams(),
    client.from("challenges").select("id,name").eq("competition_id", event.id).order("name"),
    client.from("team_assignments").select("team_id,challenge_id").eq("competition_id", event.id),
    liveRankings(),
  ]);
  if (cases.error || assignments.error) throw new Error("Could not load the organizer console.");
  const assigned = new Map(assignments.data.map(row => [row.team_id, row.challenge_id]));
  const startedTeams = new Set(scores.map(score => score.team_id));
  const participants = teams.reduce((total, team) => total + team.seat_count, 0);
  return <div className="shell page organizer-page">
    <LiveRefresh competition={event.id}/>
    <PageTitle tag="Organizer · Live competition" title="Command Console">Manage registrations, prepare challenge cases and oversee the live event.</PageTitle>
    <nav className="console-nav" aria-label="Console sections"><a href="#controls">Controls</a><a href="#teams">Teams</a><Action href="/admin/challenges" secondary className="small-button">Challenge library</Action><a href="#submissions">Submissions</a><a href="#scoreboard">Scoreboard</a></nav>
    <div className="stat-grid"><Metric tone="yellow" value={teams.length} label="Registered teams"/><Metric value={participants} label="Analysts"/><Metric tone="blue" value={cases.data.length} label="Challenge cases"/><Metric tone="mint" value={scores.reduce((total, row) => total + row.solved, 0)} label="Solved checkpoints"/></div>
    <section id="controls" className="compact"><Card className="panel">
      <div className="micro-head"><strong><Radio size={16}/> Registration</strong><Badge tone="yellow">{event.registration_open ? "Open" : "Closed"}</Badge></div>
      <p>Registration {event.registration_open ? "open" : "closed"} · {teams.length} / {event.team_capacity} team slots.</p>
      <div className="action-row left">
        <LiveForm action={manageCompetition} operation="registration" label={event.registration_open ? "Close registration" : "Open registration"} compact secondary><input type="hidden" name="open" value={String(!event.registration_open)}/></LiveForm>
      </div>
    </Card></section>
    <section id="teams" className="compact"><Card className="panel">
      <div className="micro-head"><strong><Users size={16}/> Team management</strong><Badge>{teams.length} registered</Badge></div>
      {teams.length === 0 ? <p>No registrations yet.</p> : <div className="table-scroll" tabIndex={0} aria-label="Scrollable team roster"><table>
        <thead><tr><th scope="col">Team</th><th scope="col">Roster</th><th scope="col">Status</th><th scope="col">Overall time</th><th scope="col">Assignment</th><th scope="col">Registration</th></tr></thead>
        <tbody>{teams.map(team => <tr key={team.id}><td><strong>{team.name}</strong></td>
          <td>{teamRosterNames(team).join(", ")}</td>
          <td><Badge tone={startedTeams.has(team.id) ? "mint" : ""}>{startedTeams.has(team.id) ? "In arena" : "Registered"}</Badge></td>
          <td><TeamTimes teamName={team.name} checkpoints={team.checkpoint_unlocks} sampledAt={sampledAt}/></td>
          <td>{!startedTeams.has(team.id) ? <LiveForm action={manageCompetition} operation="assign" label="Save assignment" compact secondary>
            <input type="hidden" name="team" value={team.id}/><label><span className="sr-only">Assigned challenge for {team.name}</span><select name="challenge" defaultValue={assigned.get(team.id) ?? ""}><option value="">Assign automatically</option>{cases.data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </LiveForm> : cases.data.find(item => item.id === assigned.get(team.id))?.name ?? "Unassigned"}</td>
          <td>{!startedTeams.has(team.id) && <Popup label="Remove…" title={`Remove ${team.name}?`}><p>This will remove the team’s registration.</p><LiveForm action={manageCompetition} operation="remove" label="Remove registration" compact><input type="hidden" name="team" value={team.id}/></LiveForm></Popup>}</td>
        </tr>)}</tbody>
      </table></div>}
    </Card></section>
    <section id="submissions" className="compact"><Card className="panel"><div className="micro-head"><strong><Activity size={16}/> Recent submissions</strong><Badge tone="mint">Updates every 5 seconds</Badge></div><AdminSubmissions/></Card></section>
    <section id="scoreboard" className="compact"><Card className="panel"><div className="micro-head"><strong>Leaderboard oversight</strong><Action href="/leaderboard" secondary className="small-button">Public leaderboard</Action></div><LiveScoreTable rows={scores}/></Card></section>
  </div>;
}

function teamRosterNames(team: Awaited<ReturnType<typeof organizerTeams>>["teams"][number]) {
  const linked = team.team_members.toSorted((a, b) => Number(b.user_id === team.captain_id) - Number(a.user_id === team.captain_id))
    .map(member => member.profiles?.display_name ?? "Player");
  const names = new Set(linked.map(name => name.toLowerCase()));
  return [...linked, ...team.teammate_names.filter(name => !names.has(name.toLowerCase()))];
}

function TeamTimes({ teamName, checkpoints, sampledAt }: {
  teamName: string;
  checkpoints: Awaited<ReturnType<typeof organizerTeams>>["teams"][number]["checkpoint_unlocks"];
  sampledAt: number;
}) {
  const timing = challengeTime(checkpoints);
  if (!timing) return <span>Not started</span>;

  const ordered = checkpoints.toSorted((a, b) => (a.checkpoints?.position ?? 0) - (b.checkpoints?.position ?? 0));
  return <div className="team-times">
    <strong><ElapsedClock {...timing} sampledAt={sampledAt} label={`Overall time for ${teamName}`} precise/></strong>
    <Popup label="Checkpoint times" title={`Checkpoint times for ${teamName}`}>
      <dl className="score-list">
        <div><dt>Overall time</dt><dd><ElapsedClock {...timing} sampledAt={sampledAt} label="Overall time" precise/></dd></div>
        {ordered.map(row => {
          const question = row.checkpoints;
          if (!question) return null;
          const title = `${question.position}. ${question.title}`;
          return <div key={question.position}>
            <dt>{title}{!row.completed_at && <small> (in progress)</small>}</dt>
            <dd><ElapsedClock startedAt={Date.parse(row.unlocked_at)} finishedAt={row.completed_at ? Date.parse(row.completed_at) : null} sampledAt={sampledAt} label={`Time for ${title}`} precise/></dd>
          </div>;
        })}
      </dl>
    </Popup>
  </div>;
}
