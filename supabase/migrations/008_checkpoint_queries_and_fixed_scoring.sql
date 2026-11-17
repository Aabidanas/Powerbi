begin;

-- Serialize the score backfill against in-flight checkpoint activity.
lock table public.competitions in exclusive mode;

alter table public.checkpoints add column starter_query text
  check (char_length(starter_query) <= 4000);
alter table public.leaderboard_scores add column solving_time_us bigint not null default 0
  check (solving_time_us >= 0);

create index leaderboard_time_order on public.leaderboard_scores
  (competition_id, points desc, solving_time_us, team_id);

-- The existing editor functions check organizer access and lock the competition.
-- Keep the old signatures available for callers that do not edit the starter query.
create function public.save_checkpoint(p_challenge uuid, p_position integer, p_title text, p_question text,
  p_type text, p_expected text, p_tolerance numeric, p_variants text[], p_hint text, p_query text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved uuid;
begin
  saved := public.save_checkpoint(p_challenge, p_position, p_title, p_question,
    p_type, p_expected, p_tolerance, p_variants, p_hint);
  update public.checkpoints set starter_query = case when p_query ~ '[^[:space:]]' then p_query end where id = saved;
  return saved;
end $$;

create function public.admin_append_checkpoint(p_competition uuid, p_challenge uuid, p_title text, p_question text,
  p_type text, p_expected text, p_tolerance numeric, p_variants text[], p_hint text, p_query text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved uuid;
begin
  saved := public.admin_append_checkpoint(p_competition, p_challenge, p_title, p_question,
    p_type, p_expected, p_tolerance, p_variants, p_hint);
  update public.checkpoints set starter_query = case when p_query ~ '[^[:space:]]' then p_query end where id = saved;
  return saved;
end $$;

revoke all on function public.save_checkpoint(uuid, integer, text, text, text, text, numeric, text[], text, text),
  public.admin_append_checkpoint(uuid, uuid, text, text, text, text, numeric, text[], text, text) from public, anon, authenticated;
grant execute on function public.save_checkpoint(uuid, integer, text, text, text, text, numeric, text[], text, text),
  public.admin_append_checkpoint(uuid, uuid, text, text, text, text, numeric, text[], text, text) to authenticated;

create or replace function public.admin_import_checkpoints(p_competition uuid, p_challenge uuid, p_questions jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  existing_count integer;
  saved uuid;
  entry record;
begin
  if not public.is_competition_admin(p_competition) then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;
  perform 1 from public.competitions where id = p_competition for update;
  if private.track_has_begun(p_challenge) then raise exception 'A team has already begun this track'; end if;
  if not exists(select 1 from public.challenges where id = p_challenge and competition_id = p_competition) then
    raise exception 'Challenge is unavailable';
  end if;
  if jsonb_typeof(p_questions) is distinct from 'array' then raise exception 'Provide a checkpoint list'; end if;
  if jsonb_array_length(p_questions) not between 1 and 100 then raise exception 'Provide 1 to 100 checkpoints'; end if;
  select count(*) into existing_count from public.checkpoints where challenge_id = p_challenge;
  if existing_count > 0 and (
    existing_count <> jsonb_array_length(p_questions)
    or (select max(position) from public.checkpoints where challenge_id = p_challenge) <> existing_count
  ) then
    raise exception 'Import requires the same number of consecutive checkpoints as the existing case';
  end if;
  for entry in select value, position from jsonb_array_elements(p_questions) with ordinality as rows(value, position)
  loop
    saved := public.save_checkpoint(p_challenge, entry.position::integer, entry.value->>'title', entry.value->>'question',
      entry.value->>'type', entry.value->>'expected', coalesce((entry.value->>'tolerance')::numeric, 0),
      array(select jsonb_array_elements_text(coalesce(entry.value->'variants', '[]'::jsonb))), entry.value->>'hint');
    if entry.value ? 'query' then
      if jsonb_typeof(entry.value->'query') not in ('string', 'null') then raise exception 'Query must be text or null'; end if;
      update public.checkpoints set starter_query =
        case when entry.value->>'query' ~ '[^[:space:]]' then entry.value->>'query' end
      where id = saved;
    end if;
  end loop;
end $$;

create or replace function public.submit_checkpoint(p_team uuid, p_checkpoint uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  opened public.checkpoint_unlocks; key private.checkpoint_answers;
  cp public.checkpoints; accepted boolean := false; attempt uuid; next_checkpoint uuid;
  submitted timestamptz; seconds integer; duration_us bigint; penalty integer; awarded integer;
begin
  if p_answer is null or char_length(p_answer) > 500 or trim(p_answer) = '' then raise exception 'Enter a valid answer'; end if;
  opened := private.lock_active_checkpoint(p_team,p_checkpoint);
  submitted := clock_timestamp();
  if (select count(*) from public.submissions where team_id = p_team and submitted_at > submitted - interval '1 minute') >= 12 then
    raise exception 'Too many attempts. Try again in a minute.';
  end if;
  select * into strict cp from public.checkpoints where id=p_checkpoint;
  select * into strict key from private.checkpoint_answers where checkpoint_id=p_checkpoint;
  if cp.answer_type = 'number' then
    if trim(p_answer) ~ '^[+-]?(([0-9]{1,3}(,[0-9]{3})+|[0-9]+)([.][0-9]+)?|[.][0-9]+)$' then
      accepted := abs(replace(trim(p_answer),',','')::numeric - key.expected::numeric) <= key.tolerance;
    end if;
  else
    accepted := exists(select 1 from unnest(array_prepend(key.expected,key.variants)) as variants(value)
      where private.normalize_answer(value,cp.answer_type)=private.normalize_answer(p_answer,cp.answer_type));
  end if;
  insert into public.submissions(team_id,checkpoint_id,submitted_by,answer,accepted,submitted_at)
    values(p_team,p_checkpoint,auth.uid(),p_answer,accepted,submitted) returning id into attempt;
  if not accepted then return jsonb_build_object('accepted',false); end if;
  duration_us := greatest(0,(extract(epoch from submitted-opened.unlocked_at)*1000000)::bigint);
  seconds := ceil(duration_us / 1000000.0)::integer;
  penalty := case when exists(select 1 from public.hint_usage where team_id=p_team and checkpoint_id=p_checkpoint) then 20 else 0 end;
  awarded := 100 - penalty;
  insert into public.scoring_records values(p_team,p_checkpoint,attempt,awarded,seconds,penalty);
  update public.checkpoint_unlocks set completed_at=submitted where team_id=p_team and checkpoint_id=p_checkpoint;
  select id into next_checkpoint from public.checkpoints where challenge_id=cp.challenge_id and position=cp.position+1;
  if found then insert into public.checkpoint_unlocks(team_id,checkpoint_id,unlocked_at) values(p_team,next_checkpoint,submitted); end if;
  update public.leaderboard_scores set points=points+awarded, solved=solved+1,
    solving_seconds=solving_seconds+seconds, solving_time_us=solving_time_us+duration_us where team_id=p_team;
  return jsonb_build_object('accepted',true,'points',awarded,'seconds',seconds,'next_checkpoint',next_checkpoint);
end $$;

-- Recalculate existing scores so old and new submissions use the same rules.
with penalties as (
  select s.team_id, s.checkpoint_id, case when h.team_id is null then 0 else 20 end as penalty
  from public.scoring_records s left join public.hint_usage h using (team_id, checkpoint_id)
)
update public.scoring_records s set points=100-p.penalty, hint_penalty=p.penalty
from penalties p where s.team_id=p.team_id and s.checkpoint_id=p.checkpoint_id;

with totals as (
  select s.team_id, sum(s.points) as points,
    sum(greatest(0,(extract(epoch from u.completed_at-u.unlocked_at)*1000000)::bigint)) as solving_time_us
  from public.scoring_records s join public.checkpoint_unlocks u using (team_id, checkpoint_id)
  group by s.team_id
)
update public.leaderboard_scores l set points=t.points, solving_time_us=t.solving_time_us
from totals t where l.team_id=t.team_id;

notify pgrst, 'reload schema';
commit;
