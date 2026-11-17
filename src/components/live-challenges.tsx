import { ClipboardList } from "lucide-react";
import { manageCompetition } from "@/app/admin/actions";
import { CHECKPOINT_TEMPLATE } from "@/lib/checkpoint-import";
import { DEFAULT_CHECKPOINT_POINTS, MAX_CHECKPOINT_POINTS } from "@/lib/challenges";
import { datasetFileName, datasetFileSize, type AttachedDataset } from "@/lib/datasets";
import { requireAdmin } from "@/lib/supabase/access";
import { LiveForm } from "./live-form";
import { UploadDataset } from "./upload-dataset";
import { Action, Badge, Card, PageTitle, Popup } from "./ui";

type Key = { checkpoint_id: string; expected: string; tolerance: number; variants: string[]; hint: string };
type Question = { id: string; position: number; title: string; question: string; answer_type: string; starter_query: string | null; base_points: number };

function CheckpointEditor({ challenge, position, question, answerKey }: {
  challenge: string; position: number; question?: Question; answerKey?: Key;
}) {
  return <Popup label={question ? "Edit" : "Add checkpoint"} title={question?.title ?? `Add checkpoint ${position}`}>
    <LiveForm action={manageCompetition} operation={question ? "checkpoint" : "checkpoint-new"} label="Save checkpoint">
      <input type="hidden" name="challenge" value={challenge}/><input type="hidden" name="position" value={position}/>
      <label>Title<input name="title" defaultValue={question?.title} required maxLength={80}/></label>
      <label>Question<textarea name="question" defaultValue={question?.question} required maxLength={500}/></label>
      <label>Points for a correct answer<input name="points" type="number" required min={0} max={MAX_CHECKPOINT_POINTS} step={1} defaultValue={question?.base_points ?? DEFAULT_CHECKPOINT_POINTS}/></label>
      <label>Starter query (optional, free for players)<textarea name="query" defaultValue={question?.starter_query ?? ""} rows={4} maxLength={4000} spellCheck={false}/></label>
      <label>Answer type<select name="answerType" defaultValue={question?.answer_type ?? "number"}><option value="number">Number</option><option value="text">Text</option><option value="dax">DAX</option></select></label>
      <label>Expected answer<input name="expected" defaultValue={answerKey?.expected} required maxLength={500}/></label>
      <label>Tolerance<input type="number" name="tolerance" defaultValue={answerKey?.tolerance ?? 0} min={0} step="any" required/></label>
      <label>Variants (one per line)<textarea name="variants" defaultValue={answerKey?.variants.join("\n")}/></label>
      <label>Hint<textarea name="hint" defaultValue={answerKey?.hint} required maxLength={500}/></label>
    </LiveForm>
  </Popup>;
}

export async function LiveChallenges() {
  const { event, client } = await requireAdmin();

  const [cases, keys, scores, files] = await Promise.all([
    client.from("challenges").select("id,slug,name,description,dataset_path,checkpoints(id,position,title,question,answer_type,starter_query,base_points)").eq("competition_id", event.id).order("name"),
    client.rpc("admin_case_keys", { p_competition: event.id }),
    client.from("leaderboard_scores").select("track_slug").eq("competition_id", event.id),
    client.rpc("admin_attached_datasets", { p_competition: event.id }),
  ]);
  if (cases.error || keys.error || scores.error) throw new Error("Could not load the challenge library.");
  const startedTracks = new Set(scores.data.map(score => score.track_slug));
  const answerKeys = new Map((keys.data as Key[]).map(key => [key.checkpoint_id, key]));
  const attachedFiles = new Map(((files.data ?? []) as AttachedDataset[]).map(file => [file.challenge_id, file]));
  return <div className="shell page organizer-page">
    <PageTitle tag="Organizer · Live competition" title="Challenge Library">Manage datasets, questions, hints, and answer keys before players begin each track.</PageTitle>
    <Action href="/admin" secondary className="small-button">Back to organizer console</Action>
    <section id="cases" className="compact"><Card className="panel">
      <div className="micro-head"><strong><ClipboardList size={16}/> Challenges and datasets</strong></div>
      <div className="team-admin-grid">{cases.data.map(item => {
        const editable = !startedTracks.has(item.slug);
        const file = attachedFiles.get(item.id);
        const fileSize = file && datasetFileSize(file);
        return <div key={item.id} className="plain-panel"><h3>{item.name}</h3><p>{item.description}</p><Badge>{editable ? "Editable" : "In use"} · {item.checkpoints.length} checkpoints</Badge>
        <div className="attached-dataset">
          <h4>Attached dataset</h4>
          {file ? <>
            <p>{datasetFileName(file)}{fileSize && ` · ${fileSize}`}</p>
            <a className="button secondary small-button" href={`/admin/challenges/${item.id}/dataset`}>Download dataset</a>
          </> : <p className="muted">{files.error ? "Dataset details unavailable." : "No dataset attached."}</p>}
        </div>
        {editable && <Popup label="Edit case and dataset" title={item.name}><LiveForm action={manageCompetition} operation="case" label="Save challenge">
          <input type="hidden" name="challenge" value={item.id}/><label>Case name<input name="name" defaultValue={item.name} required maxLength={80}/></label><label>Description<textarea name="description" defaultValue={item.description} required maxLength={1000}/></label><label>Private dataset object path<input name="path" defaultValue={item.dataset_path} required/></label>
        </LiveForm></Popup>}
        {editable && <>
          {!item.checkpoints.length && <LiveForm action={manageCompetition} operation="starter" label="Load starter dataset and questions" compact>
            <input type="hidden" name="challenge" value={item.id}/>
          </LiveForm>}
          <Popup label="Upload dataset" title={`Upload a dataset for ${item.name}`}><UploadDataset competition={event.id} challenge={item.id}/></Popup>
          <Popup label="Import checkpoints" title={`Import checkpoints for ${item.name}`}><LiveForm action={manageCompetition} operation="checkpoint-import" label="Import checkpoints">
            <input type="hidden" name="challenge" value={item.id}/>
            <p>Upload a JSON list in checkpoint order. An existing track requires the same number of checkpoints.</p>
            <a className="button secondary small-button" href={`data:application/json;charset=utf-8,${encodeURIComponent(CHECKPOINT_TEMPLATE)}`} download="checkpoints-template.json">Download JSON template</a>
            <label>Checkpoint JSON<input name="questions" type="file" accept=".json,application/json" required/></label>
          </LiveForm></Popup>
        </>}
        <ol className="editor-list">{[...item.checkpoints].sort((a, b) => a.position - b.position).map(question =>
          <li key={question.id}><span>{question.position}. {question.title} · {question.base_points} pts</span>
            {editable && <CheckpointEditor challenge={item.id} position={question.position} question={question} answerKey={answerKeys.get(question.id)}/>}
          </li>
        )}</ol>
        {editable && !startedTracks.size && <CheckpointEditor challenge={item.id} position={Math.max(0, ...item.checkpoints.map(question => question.position)) + 1}/>}
      </div>; })}</div>
    </Card></section>
  </div>;
}
