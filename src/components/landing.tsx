import { Activity, ArrowRight, BarChart3, BookOpen, Clock3, Download, MapPin, ScanLine, Trophy, Users, Zap } from "lucide-react";
import { CHECKPOINT_HINT_COST, type TrackId } from "@/lib/challenges";
import { Action, Badge, Card, trackIcons } from "./ui";

const battle = [
  { name: "Sync Dataset & Model", icon: Download, description: "Download the enterprise dataset assigned to your team. Import it into Power BI Desktop, inspect the schema and configure relationships.", note: "Est. setup: 15 minutes", tone: "yellow" },
  { name: "Solve Checkpoints", icon: ScanLine, description: "Checkpoints unlock sequentially. Formulate DAX measures, derive business KPIs and paste your answers into the validation panel.", note: "Points vary by checkpoint", tone: "blue" },
  { name: "Ascend Leaderboard", icon: BarChart3, description: "Earn the checkpoint’s points with a correct answer. Track your rank as scores update.", note: "Automated scoring engine", tone: "mint" },
];
const specs = [
  { name: "Teams of 1–3 Analysts", description: "Compete solo or assemble a squad. Share one case, one checkpoint pipeline and one team score.", icon: Users, tone: "yellow" },
  { name: "Solving Time", description: `Solving time breaks ties on points. A hint costs ${CHECKPOINT_HINT_COST} points on the checkpoint.`, icon: Clock3, tone: "mint" },
  { name: "Real-Time Telemetry", description: "See accepted submissions update checkpoint progress and team rankings.", icon: Zap, tone: "blue" },
  { name: "BITS Pilani Dubai Campus", description: "Dubai International Academic City · Microsoft Tech Club", icon: MapPin, tone: "" },
];

type PreviewTrack = { id: string; name: string; description: string };
type PreviewLeader = { id: string; name: string; points: number; solved: number; seconds: number };

export function LandingContent({ tracks, leaders, arenaHref, registrationOpen }: {
  tracks: PreviewTrack[]; leaders: PreviewLeader[]; arenaHref: string; registrationOpen: boolean;
}) {
  return <>
    <section className="hero-grid">
      <div className="shell hero">
        <div className="hero-intro">
          <Badge className="hero-badge"><i className="dot gold"/> Microsoft Tech Club · BITS Pilani Dubai <Badge tone="yellow">Season 2026</Badge></Badge>
          <h1>DATA <span>QUEST</span></h1>
          <h2>Turn data into victory.</h2>
          <p>Four challenges. One championship. Analyze complex multi-dimensional enterprise datasets, unlock sequential checkpoints in real time, and climb the live university leaderboard.</p>
          <div className="action-row"><Action href={arenaHref} arrow>Enter the arena</Action><Action href="/rules" secondary><BookOpen size={15}/> Explore rules &amp; DAX specs</Action></div>
        </div>
      </div>
    </section>
    {tracks.length > 0 && <section className="section alt" id="tracks"><div className="shell">
      <div className="section-intro split"><div><Badge tone="yellow"><BookOpen size={13}/> Arena tracks &amp; datasets</Badge><h2>Four Enterprise<br/> Battlegrounds</h2></div><p>Every track mirrors real-world analytics deployments with skewed distributions, operational bottlenecks and multi-layered DAX KPI puzzles. Each team tackles one assigned track.</p></div>
      <div className="track-grid">
        {tracks.map((track, i) => {
          const Icon = trackIcons[track.id as TrackId] ?? BarChart3;
          return <Card key={track.id} className="track-card"><div className="track-top"><span className={`icon-tile landing-${track.id}`}><Icon size={19}/></span><Badge>Tier 1</Badge></div>
            <small>Track {String(i + 1).padStart(2, "0")}</small><h3>{track.name}</h3><p>{track.description}</p>
            
          </Card>;
        })}
      </div>
    </div></section>}
    <section className="section"><div className="shell">
      <div className="section-intro centered"><Badge>Protocol &amp; lifecycle</Badge><h2>Championship Battle Flow</h2><p>From the initial whistle to the championship ceremony in three operational phases.</p></div>
      <div className="flow-grid">{battle.map(({name, icon: Icon, description, note, tone}, i) => <Card key={name} className="flow-card"><div className="track-top"><span className={`icon-tile ${tone}`}>0{i + 1}</span><span className="circle-icon"><Icon size={15}/></span></div><h3>{name}</h3><p>{description}</p><small><i className={`dot ${tone}`}/>{note}</small></Card>)}</div>
    </div></section>
    <section className="section alt"><div className="shell arena-preview">
      <div><Badge tone="yellow">Tournament regulations</Badge><h2>Arena Structure &amp; Specs</h2><p className="muted">Structured for maximum technical intensity and rapid collaboration under competitive pressure.</p>
        <div className="spec-list">{specs.map(({ name, description, icon: Icon, tone }) => <Card className="spec-card" key={name}><span className={`icon-tile ${tone}`}><Icon size={17}/></span><div><h3>{name}</h3><p>{description}</p></div></Card>)}</div>
      </div>
      <Card className="preview-card"><div className="micro-head"><strong><Trophy size={16}/> Live leaderboard preview</strong><Badge tone="mint"><i className="dot"/> Competition standings</Badge></div>
        {leaders.length >= 3 && <div className="mini-podium">{[leaders[1], leaders[0], leaders[2]].map((leader, i) => <div key={leader.id} className={i === 1 ? "first" : ""}>{i === 1 && <Trophy size={17}/>}<b>{[2, 1, 3][i]}</b><span>{leader.name}</span><strong>{leader.points} pts</strong><div className="podium-block"/></div>)}</div>}
        {!leaders.length && <p className="empty-state">No ranked teams yet.</p>}
        <div className="mini-rank">{leaders.map((leader, i) => <div key={leader.id}><Badge tone={i === 0 ? "yellow" : ""}>#{i + 1}</Badge><strong>{leader.name}</strong><span>{leader.solved} checkpoints</span><span>{Math.floor(leader.seconds / 60)}m {String(leader.seconds % 60).padStart(2, "0")}s</span><b>{leader.points} pts</b></div>)}</div>
        <Action href="/leaderboard" className="full-width" secondary arrow>View full standings</Action>
      </Card>
    </div></section>
    <section className="section cta-section"><div className="shell"><Card className="final-cta"><div><Badge tone="yellow">Championship registration {registrationOpen ? "open" : "closed"}</Badge><h2>Ready to prove your analytics mettle?</h2><p>Form your team, prepare your Power BI workspace, and claim your place on the live university podium.</p></div><div className="action-row">{registrationOpen && <Action href="/register">Register squad now <ArrowRight size={14}/></Action>}<Action href="/rules" secondary><Activity size={14}/> Competition details</Action></div></Card></div></section>
  </>;
}
