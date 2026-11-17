import Link from "next/link";
import { redirect } from "next/navigation";
import { beginChallenge, playCheckpoint } from "@/app/live-actions";
import { challengeTime, formatDuration } from "@/lib/challenge-time";
import { competitionConfig } from "@/lib/supabase/access";
import { acceptedCheckpointAnswer, currentTeamId, liveRankings, ownTeam, playerMission, teamLobbyDetails } from "@/lib/supabase/data";
import { ElapsedClock } from "./elapsed-clock";
import { LiveForm } from "./live-form";
import { LiveRefresh } from "./live-refresh";
import { StarterQuery } from "./starter-query";
import { TeamCode } from "./team-code";
import { Action, Badge, Card, Metric, Notice, PageTitle, Popup } from "./ui";

export async function LiveLobby() {
  const team = await ownTeam();
  if (!team) return <div className="shell page"><PageTitle tag="Player · Live competition" title="Team Lobby">Create a team or use a code from your captain.</PageTitle>
    <Action href="/register" arrow>Create or join a team</Action></div>;
  const mission = await playerMission(team.id);
  const started = !!mission?.progress.length;
  const { members, code } = await teamLobbyDetails(team.id, team.isCaptain && !started);
  const roster = members.toSorted((a, b) => Number(b.user_id === team.captain_id) - Number(a.user_id === team.captain_id)
    || (a.profiles?.display_name ?? "").localeCompare(b.profiles?.display_name ?? ""));
  const linkedNames = new Set(roster.map(member => member.profiles?.display_name?.toLowerCase()));
  const legacyNames = (team.teammate_names as string[]).filter(name => !linkedNames.has(name.toLowerCase()));
  return <div className="shell page">
    <LiveRefresh team={team.id} arenaStarted={team.isCaptain ? undefined : started}/>
    <PageTitle tag="Player · Live competition" title="Team Lobby">Your team shares one challenge, timer, and score.</PageTitle>
    <div className="dashboard-two">
      <Card className="panel"><h2>{team.name}</h2>
        <p>{members.length} of 3 player accounts linked</p>
        <ul className="roster">{roster.map(member => <li key={member.user_id}>
          <strong>{member.profiles?.display_name ?? "Player"}</strong>
          <Badge tone={member.user_id === team.captain_id ? "yellow" : ""}>{member.user_id === team.captain_id ? "Captain" : "Analyst"}</Badge>
        </li>)}</ul>
        {code && <TeamCode code={code}/>}
        {legacyNames.length > 0 && <p className="muted">Previously listed without a linked account · {legacyNames.join(", ")}</p>}
      </Card>
      <Card className="panel mission"><Badge tone="mint">{started ? "Challenge opened" : "Team challenge"}</Badge><h2>{mission?.challenge.name ?? "Your team challenge"}</h2>
        <p>{mission?.challenge.description ?? "A track is assigned when your team begins."}</p>
        <div className="action-row left">{started ? <Action href="/arena" arrow>Open arena</Action>
          : team.isCaptain ? <LiveForm action={beginChallenge} label="Begin challenge"><p>Make sure your teammates have joined. Starting locks the roster and starts everyone’s timer.</p></LiveForm>
          : <Notice>Waiting for your captain to begin.</Notice>
        }<Action href="/rules" secondary>Read competition rules</Action></div>
      </Card>
    </div>
  </div>;
}

export async function LiveArena({ reviewPosition, teammateAdvanced }: { reviewPosition?: string; teammateAdvanced?: boolean }) {
  const team = await ownTeam();
  if (!team) redirect("/lobby");
  const mission = await playerMission(team.id);
  if (!mission) redirect("/lobby");
  const timing = challengeTime(mission.progress);
  if (!timing) redirect("/lobby");

  const unlocks = new Map(mission.progress.map(row => [row.checkpoint_id, row]));
  const currentUnlock = mission.progress.find(row => !row.completed_at);
  const current = mission.questions.find(question => question.id === currentUnlock?.checkpoint_id);
  const solvedQuestions = mission.questions.filter(question => unlocks.get(question.id)?.completed_at);
  const selected = solvedQuestions.find(question => String(question.position) === reviewPosition)
    ?? current ?? solvedQuestions.at(-1);
  const selectedUnlock = selected && unlocks.get(selected.id);
  const completedAt = selectedUnlock?.completed_at;
  const submittedAnswer = completedAt && selected ? await acceptedCheckpointAnswer(team.id, selected.id) : null;
  const points = mission.scores.reduce((total, row) => total + row.points, 0);
  const { sampledAt } = mission;
  return <div className="shell page">
    <LiveRefresh team={team.id}/>
    <PageTitle tag="Player · Live arena" title={mission.challenge.name}>{mission.challenge.description}</PageTitle>
    {teammateAdvanced && <Notice>Your team already solved that checkpoint. The arena is up to date.</Notice>}
    <div className="arena-layout">
      <Card className="panel arena-side"><div className="micro-head"><strong>{team.name}</strong></div>
        <ol id="checkpoints" className="checkpoint-list">{mission.questions.map(question => {
          const score = mission.scores.find(row => row.checkpoint_id === question.id);
          const solved = !!unlocks.get(question.id)?.completed_at;
          const isCurrent = question.id === current?.id;
          const isSelected = question.id === selected?.id;
          return <li className={`${solved ? "done" : isCurrent ? "active" : ""} ${isSelected ? "selected" : ""}`} key={question.id}><span>{question.position}</span><div>
            {solved || isCurrent
              ? <Link href={solved ? `/arena?checkpoint=${question.position}#checkpoint-workspace` : "/arena#checkpoint-workspace"} aria-current={isSelected ? "true" : undefined}>{question.title}</Link>
              : question.title}
            <small>{score ? `Solved · +${score.points} points` : solved ? "Solved" : question.id === current?.id ? "Current checkpoint" : "Locked"}</small>
          </div></li>;
        })}</ol>
        {mission.progress.some(row => row.completed_at) && <Popup label="Checkpoint times" title="Your checkpoint times"><dl className="score-list">
          {mission.questions.map(question => {
            const row = unlocks.get(question.id);
            return row?.completed_at && <div key={question.id}><dt>{question.position}. {question.title}</dt><dd className="elapsed-time">{formatDuration(Date.parse(row.completed_at) - Date.parse(row.unlocked_at), true)}</dd></div>;
          })}
        </dl></Popup>}
        <Action href="/leaderboard" secondary>Leaderboard</Action>
      </Card>
      <div className="stack">
        <Card className="panel"><div className="micro-head"><strong>Case dataset</strong></div><a className="button secondary" href="/mission/dataset">Download assigned CSV</a></Card>
        <Card className="panel checkpoint-panel">
          <div id="checkpoint-workspace" className="micro-head"><strong>Checkpoint workspace</strong>
            {selected && <Badge tone={completedAt ? "mint" : "yellow"}>Checkpoint {selected.position}{completedAt && " · Solved"}</Badge>}
          </div>
          {timing.finishedAt !== null && <Notice>You completed every checkpoint.</Notice>}
          {selected && selectedUnlock && <>
            <h2>{selected.title}</h2><p>{selected.question}</p>
            {selected.starter_query && <StarterQuery key={selected.id} query={selected.starter_query}/>}
            <p className="checkpoint-clock">Question time <strong><ElapsedClock key={selected.id} startedAt={Date.parse(selectedUnlock.unlocked_at)} finishedAt={completedAt ? Date.parse(completedAt) : null} sampledAt={sampledAt} label="Question time" precise/></strong></p>
          </>}
          {completedAt && selected ? <div className="form-stack">
            <label>Team’s accepted answer<textarea className="review-answer" value={submittedAnswer ?? ""} readOnly rows={3}/></label>
            <div className="action-row left">
              <Badge tone="mint">Answer accepted</Badge>
              {mission.hints.has(selected.id) && <Badge>Hint used</Badge>}
              {current && <Action href="/arena#checkpoint-workspace" secondary>Back to current question</Action>}
            </div>
          </div> : current && <>
            <div className="stack">
              <LiveForm key={current.id} action={playCheckpoint} label="Submit answer" operation="answer">
                <input type="hidden" name="checkpoint" value={current.id}/><label>Your answer<textarea name="answer" required maxLength={500} rows={3}/></label>
              </LiveForm>
              <LiveForm key={current.id + "-hint"} action={playCheckpoint} label={mission.hints.has(current.id) ? "Show hint again" : "Reveal hint (−20 points)"} operation="hint" secondary compact><input type="hidden" name="checkpoint" value={current.id}/></LiveForm>
            </div>
          </>}
        </Card>
      </div>
      <div className="stack"><Metric tone="yellow" value={points} label="Team score"/><Metric value={mission.scores.length} label="Checkpoints solved"/>
        <Metric label="Overall time" value={<ElapsedClock {...timing} sampledAt={sampledAt} label="Overall challenge time" precise/>}/>
      </div>
    </div>
  </div>;
}

export function LiveScoreTable({ rows, own }: { rows: Awaited<ReturnType<typeof liveRankings>>; own?: string }) {
  if (!rows.length) return <p className="empty-state">No ranked teams yet.</p>;
  return <div className="table-scroll" tabIndex={0} aria-label="Scrollable leaderboard"><table>
    <thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">Track</th><th scope="col">Solved</th><th scope="col">Score</th><th scope="col">Solving time</th></tr></thead>
    <tbody>{rows.map((row, i) => <tr key={row.team_id} className={row.team_id === own ? "own-row" : ""}>
      <td>{i + 1}</td><td>{row.team_name}{row.team_id === own && " · Your team"}</td><td>{row.track_slug}</td><td>{row.solved}</td><td><strong>{row.points}</strong></td><td className="elapsed-time">{row.solved ? formatDuration(row.solving_time_us / 1000, true) : "—"}</td>
    </tr>)}</tbody>
  </table></div>;
}

export async function LiveLeaderboard() {
  const event = await competitionConfig();
  if (!event) return <div className="shell page"><PageTitle tag="DATA QUEST" title="Leaderboard"/><Notice>Competition setup is still in progress.</Notice></div>;
  const [rows, own] = await Promise.all([liveRankings(), currentTeamId()]);
  return <div className="shell page"><LiveRefresh competition={event.id}/>
    <PageTitle tag="Live rankings · DATA QUEST" title="Leaderboard">Points determine rank. The faster solving time wins when scores are tied.</PageTitle>
    {rows.length > 0 && <div className="podium-grid">{rows.slice(0, 3).map((row, i) => <Card className={`podium-card ${i === 0 ? "first yellow" : ""}`} key={row.team_id}><Badge>Rank {i + 1}</Badge><div className="podium-team"><h2>{row.team_name}</h2><strong>{row.points} pts</strong></div></Card>)}</div>}
    <Card className="rank-table"><LiveScoreTable rows={rows} own={own}/></Card>
  </div>;
}
