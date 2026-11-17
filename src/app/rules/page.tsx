import { BookOpen } from "lucide-react";
import { Action, Card, PageTitle } from "@/components/ui";
import { CHECKPOINT_HINT_COST } from "@/lib/challenges";

export const metadata = { title: "Rules & DAX Specs" };

export default function Rules() {
  return <div className="shell page">
    <PageTitle tag="Tournament regulations" title="Rules & DAX Specs">Read the competition protocol and prepare your Power BI workspace.</PageTitle>
    <div className="dashboard-two">
      <Card className="panel"><div className="micro-head"><strong><BookOpen size={17}/> Competition protocol</strong></div><h2>How to compete</h2><ol className="rules-list"><li>Each player signs in to their own account. The captain creates a team and shares its code with up to two teammates.</li><li>Your team shares one dataset, checkpoint progression, and score. Anyone on the team can answer.</li><li>The captain begins the challenge, locking the roster and opening the first checkpoint for everyone.</li><li>The first correct submission advances the whole team. Hints are shared within the team.</li><li>Rankings sort by total points descending, then cumulative solving time ascending, then team ID ascending.</li></ol><Action href="/register" arrow>Create or join a team</Action></Card>
      <Card className="panel"><h2>Checkpoint scoring</h2><dl className="score-list"><div><dt>Correct answer</dt><dd>Points shown on the question</dd></div><div><dt>Hint used by anyone on the team</dt><dd>−{CHECKPOINT_HINT_COST} pts</dd></div><div><dt>Show query, when available</dt><dd>Free</dd></div></dl><p>The hint deduction applies once per question, with a minimum award of zero. Solving time breaks ties between teams on the same score.</p><h3>DAX validation</h3><p>Follow the question’s table and column naming instructions. Submitted expressions are normalized for spacing and case and then compared against accepted strings.</p></Card>
    </div>
  </div>;
}
