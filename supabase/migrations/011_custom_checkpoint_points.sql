begin;

lock table public.competitions in exclusive mode;
alter table public.competitions alter column hint_penalty set default 50;
update public.competitions set hint_penalty=50 where hint_penalty<>50;
alter table public.checkpoints add column base_points integer not null default 100 check (base_points >= 0);
alter table public.scoring_records drop constraint scoring_records_points_check,
  add constraint scoring_records_points_check check (points >= 0);
alter table public.leaderboard_scores alter column points type bigint;

create function public.save_checkpoint(p_challenge uuid, p_position integer, p_title text, p_question text,
  p_type text, p_expected text, p_tolerance numeric, p_variants text[], p_hint text, p_query text, p_points integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved uuid;
begin
  saved := public.save_checkpoint(p_challenge, p_position, p_title, p_question,
    p_type, p_expected, p_tolerance, p_variants, p_hint, p_query);
  update public.checkpoints set base_points=p_points where id=saved;
  return saved;
end $$;

create function public.admin_append_checkpoint(p_competition uuid, p_challenge uuid, p_title text, p_question text,
  p_type text, p_expected text, p_tolerance numeric, p_variants text[], p_hint text, p_query text, p_points integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved uuid;
begin
  saved := public.admin_append_checkpoint(p_competition, p_challenge, p_title, p_question,
    p_type, p_expected, p_tolerance, p_variants, p_hint, p_query);
  update public.checkpoints set base_points=p_points where id=saved;
  return saved;
end $$;

create function public.admin_import_checkpoints_with_points(p_competition uuid, p_challenge uuid, p_questions jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_import_checkpoints(p_competition, p_challenge, p_questions);
  if exists (
    select 1 from jsonb_array_elements(p_questions) as entry(value)
    where value ? 'points' and (
      jsonb_typeof(value->'points') <> 'number' or (value->>'points') !~ '^[0-9]+$'
    )
  ) then
    raise exception 'Checkpoint points must be whole numbers of zero or more';
  end if;
  update public.checkpoints cp set base_points=(entry.value->>'points')::integer
    from jsonb_array_elements(p_questions) with ordinality as entry(value, position)
    where cp.challenge_id=p_challenge and cp.position=entry.position and entry.value ? 'points';
end $$;

revoke all on function public.save_checkpoint(uuid, integer, text, text, text, text, numeric, text[], text, text, integer),
  public.admin_append_checkpoint(uuid, uuid, text, text, text, text, numeric, text[], text, text, integer),
  public.admin_import_checkpoints_with_points(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_checkpoint(uuid, integer, text, text, text, text, numeric, text[], text, text, integer),
  public.admin_append_checkpoint(uuid, uuid, text, text, text, text, numeric, text[], text, text, integer),
  public.admin_import_checkpoints_with_points(uuid, uuid, jsonb) to authenticated;

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
  penalty := case when exists(select 1 from public.hint_usage where team_id=p_team and checkpoint_id=p_checkpoint) then 50 else 0 end;
  awarded := greatest(0,cp.base_points-penalty);
  insert into public.scoring_records values(p_team,p_checkpoint,attempt,awarded,seconds,penalty);
  update public.checkpoint_unlocks set completed_at=submitted where team_id=p_team and checkpoint_id=p_checkpoint;
  select id into next_checkpoint from public.checkpoints where challenge_id=cp.challenge_id and position=cp.position+1;
  if found then insert into public.checkpoint_unlocks(team_id,checkpoint_id,unlocked_at) values(p_team,next_checkpoint,submitted); end if;
  update public.leaderboard_scores set points=points+awarded, solved=solved+1,
    solving_seconds=solving_seconds+seconds, solving_time_us=solving_time_us+duration_us where team_id=p_team;
  return jsonb_build_object('accepted',true,'points',awarded,'seconds',seconds,'next_checkpoint',next_checkpoint);
end $$;

with revised as (
  select s.team_id, s.checkpoint_id, cp.base_points, case when h.team_id is null then 0 else 50 end as penalty
  from public.scoring_records s join public.checkpoints cp on cp.id=s.checkpoint_id
  left join public.hint_usage h on h.team_id=s.team_id and h.checkpoint_id=s.checkpoint_id
)
update public.scoring_records s set points=greatest(0,r.base_points-r.penalty), hint_penalty=r.penalty
from revised r where s.team_id=r.team_id and s.checkpoint_id=r.checkpoint_id
  and (s.points, s.hint_penalty) is distinct from (greatest(0,r.base_points-r.penalty), r.penalty);

with totals as (
  select team_id, sum(points) as points from public.scoring_records group by team_id
)
update public.leaderboard_scores l set points=t.points
from totals t where l.team_id=t.team_id and l.points<>t.points;

notify pgrst, 'reload schema';
commit;
