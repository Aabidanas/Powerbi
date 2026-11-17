begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'ended')),
  registration_open boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  team_capacity integer not null default 48 check (team_capacity > 0),
  prize_aed integer not null default 5000 check (prize_aed >= 0),
  point_bands integer[] not null default array[100,90,80,70],
  hint_penalty integer not null default 20 check (hint_penalty between 0 and 100),
  check (starts_at is null or ends_at is null or starts_at < ends_at),
  check (array_lower(point_bands, 1) = 1 and cardinality(point_bands) = 4 and array_position(point_bands, null) is null
    and point_bands[1] <= 100 and point_bands[1] >= point_bands[2] and point_bands[2] >= point_bands[3]
    and point_bands[3] >= point_bands[4] and point_bands[4] >= 0)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 40),
  seat_count integer not null check (seat_count between 1 and 3),
  captain_id uuid not null references public.profiles(id),
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, competition_id)
);
create unique index teams_unique_name on public.teams(competition_id, lower(trim(name)));

create table public.team_members (
  competition_id uuid not null,
  team_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  foreign key (team_id, competition_id) references public.teams(id, competition_id) on delete cascade,
  primary key (team_id, user_id),
  unique (competition_id, user_id)
);

create table public.team_invites (
  code uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade unique,
  revoked_at timestamptz
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null,
  dataset_path text not null,
  unique (competition_id, slug),
  unique (id, competition_id)
);

create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  question text not null,
  answer_type text not null check (answer_type in ('number', 'text', 'dax')),
  unique (challenge_id, position)
);

create table private.checkpoint_answers (
  checkpoint_id uuid primary key references public.checkpoints(id) on delete cascade,
  expected text not null check (char_length(trim(expected)) > 0),
  tolerance numeric not null default 0 check (tolerance >= 0),
  variants text[] not null default array[]::text[],
  hint text not null
);

create table public.team_assignments (
  team_id uuid primary key,
  competition_id uuid not null,
  challenge_id uuid not null,
  foreign key (team_id, competition_id) references public.teams(id, competition_id) on delete cascade,
  foreign key (challenge_id, competition_id) references public.challenges(id, competition_id) on delete cascade
);
create index assignments_by_challenge on public.team_assignments(challenge_id);

create table public.checkpoint_unlocks (
  team_id uuid not null references public.teams(id) on delete cascade,
  checkpoint_id uuid not null references public.checkpoints(id) on delete cascade,
  unlocked_at timestamptz not null,
  completed_at timestamptz,
  primary key (team_id, checkpoint_id),
  check (completed_at is null or completed_at >= unlocked_at)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  checkpoint_id uuid not null,
  submitted_by uuid not null references public.profiles(id),
  answer text not null check (char_length(answer) <= 500),
  accepted boolean not null,
  submitted_at timestamptz not null default now(),
  foreign key (team_id, checkpoint_id) references public.checkpoint_unlocks(team_id, checkpoint_id) on delete cascade
);
create unique index one_accepted_submission on public.submissions(team_id, checkpoint_id) where accepted;
create index recent_submission_attempts on public.submissions(team_id, submitted_at desc);

create table public.hint_usage (
  team_id uuid not null,
  checkpoint_id uuid not null,
  used_by uuid not null references public.profiles(id),
  used_at timestamptz not null default now(),
  primary key (team_id, checkpoint_id),
  foreign key (team_id, checkpoint_id) references public.checkpoint_unlocks(team_id, checkpoint_id) on delete cascade
);

create table public.scoring_records (
  team_id uuid not null,
  checkpoint_id uuid not null,
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  points integer not null check (points between 0 and 100),
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  hint_penalty integer not null check (hint_penalty between 0 and 100),
  primary key (team_id, checkpoint_id),
  foreign key (team_id, checkpoint_id) references public.checkpoint_unlocks(team_id, checkpoint_id) on delete cascade
);

create table public.admin_roles (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (competition_id, user_id)
);

-- Public projection. Never copy emails, account IDs, answers or invites here.
create table public.leaderboard_scores (
  team_id uuid primary key,
  competition_id uuid not null,
  team_name text not null,
  track_slug text not null,
  solved integer not null default 0,
  points integer not null default 0,
  solving_seconds bigint not null default 0,
  foreign key (team_id, competition_id) references public.teams(id, competition_id) on delete cascade
);
create index leaderboard_order on public.leaderboard_scores(competition_id, points desc, solving_seconds, team_id);

create function public.is_competition_admin(p_competition uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_roles where competition_id = p_competition and user_id = auth.uid());
$$;

create function public.can_view_team(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.team_members where team_id = p_team and user_id = auth.uid())
    or exists(select 1 from public.teams where id = p_team and public.is_competition_admin(competition_id));
$$;

create function public.is_team_captain(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.teams where id = p_team and captain_id = auth.uid());
$$;

create function public.can_view_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() = p_profile or exists(select 1 from public.team_members m where m.user_id = p_profile and public.can_view_team(m.team_id));
$$;

create function public.can_view_checkpoint(p_checkpoint uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.checkpoints cp join public.challenges ch on ch.id = cp.challenge_id
    where cp.id = p_checkpoint and (
      public.is_competition_admin(ch.competition_id) or exists (
        select 1 from public.checkpoint_unlocks u join public.team_members m on m.team_id = u.team_id
        where u.checkpoint_id = cp.id and m.user_id = auth.uid()
      )
    )
  );
$$;

do $$
declare t text;
begin
  foreach t in array array['competitions','profiles','teams','team_members','team_invites','challenges','checkpoints','team_assignments','checkpoint_unlocks','submissions','hint_usage','scoring_records','admin_roles','leaderboard_scores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

alter table private.checkpoint_answers enable row level security;
revoke all on private.checkpoint_answers from public, anon, authenticated;
grant select on public.competitions, public.leaderboard_scores to anon;

create policy competition_read on public.competitions for select using (true);
create policy leaderboard_read on public.leaderboard_scores for select using (true);
create policy profile_read on public.profiles for select to authenticated using (public.can_view_profile(id));
create policy team_read on public.teams for select to authenticated using (public.can_view_team(id));
create policy roster_read on public.team_members for select to authenticated using (public.can_view_team(team_id));
create policy invite_read on public.team_invites for select to authenticated using (public.is_team_captain(team_id));
create policy challenge_read on public.challenges for select to authenticated using (
  public.is_competition_admin(competition_id) or exists (
    select 1 from public.team_assignments a where a.challenge_id = challenges.id and public.can_view_team(a.team_id)
  )
);
create policy checkpoint_read on public.checkpoints for select to authenticated using (public.can_view_checkpoint(id));
create policy assignment_read on public.team_assignments for select to authenticated using (
  public.is_competition_admin(competition_id) or (public.can_view_team(team_id) and exists (
    select 1 from public.competitions c where c.id = competition_id and c.status <> 'waiting'
  ))
);
create policy unlock_read on public.checkpoint_unlocks for select to authenticated using (public.can_view_team(team_id));
create policy submissions_read on public.submissions for select to authenticated using (public.can_view_team(team_id));
create policy hints_read on public.hint_usage for select to authenticated using (public.can_view_team(team_id));
create policy scores_read on public.scoring_records for select to authenticated using (public.can_view_team(team_id));
create policy admin_role_read on public.admin_roles for select to authenticated using (user_id = auth.uid());

create function public.register_team(p_competition uuid, p_team text, p_display text, p_seats integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare event public.competitions; new_team uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into event from public.competitions where id = p_competition for update;
  if not found or not event.registration_open or event.status <> 'waiting'
    or event.starts_at <= clock_timestamp() or event.ends_at <= clock_timestamp() then raise exception 'Registration is closed'; end if;
  if (select count(*) from public.teams where competition_id = p_competition) >= event.team_capacity then raise exception 'Competition is full'; end if;
  insert into public.profiles(id,display_name) values (auth.uid(),trim(p_display)) on conflict (id) do update set display_name = excluded.display_name;
  insert into public.teams(competition_id,name,seat_count,captain_id) values (p_competition,trim(p_team),p_seats,auth.uid()) returning id into new_team;
  insert into public.team_members values (p_competition,new_team,auth.uid());
  insert into public.team_invites(team_id) values (new_team);
  return new_team;
end $$;

create function public.join_team(p_invite uuid, p_display text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare squad public.teams; event public.competitions;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select t.* into squad from public.team_invites i join public.teams t on t.id = i.team_id
    where i.code = p_invite and i.revoked_at is null;
  if not found then raise exception 'Invalid invite'; end if;
  select * into event from public.competitions where id = squad.competition_id for share;
  if not event.registration_open or event.status <> 'waiting'
    or event.starts_at <= clock_timestamp() or event.ends_at <= clock_timestamp() then raise exception 'Team changes are closed'; end if;
  select * into squad from public.teams where id = squad.id for update;
  if not found or not exists(select 1 from public.team_invites where code = p_invite and team_id = squad.id and revoked_at is null) then raise exception 'Invalid invite'; end if;
  if (select count(*) from public.team_members where team_id = squad.id) >= squad.seat_count then raise exception 'Team is full'; end if;
  insert into public.profiles(id,display_name) values (auth.uid(),trim(p_display)) on conflict (id) do update set display_name = excluded.display_name;
  insert into public.team_members values (squad.competition_id,squad.id,auth.uid());
  return squad.id;
end $$;

create function public.set_team_ready(p_team uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_team_captain(p_team) then raise exception 'Captain access required'; end if;
  update public.teams set ready = p_ready where id = p_team;
end $$;

create function public.assign_team(p_team uuid, p_challenge uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare event public.competitions;
begin
  select c.* into event from public.competitions c join public.teams t on t.competition_id = c.id where t.id = p_team for update of c;
  if not found or not public.is_competition_admin(event.id) then raise exception 'Organizer access required'; end if;
  if event.status <> 'waiting' then raise exception 'Assignments are locked'; end if;
  if p_challenge is null then delete from public.team_assignments where team_id = p_team;
  else insert into public.team_assignments values (p_team,event.id,p_challenge)
    on conflict (team_id) do update set challenge_id = excluded.challenge_id;
  end if;
end $$;

create function public.configure_competition(p_id uuid, p_open boolean, p_start timestamptz, p_end timestamptz,
  p_capacity integer, p_prize integer, p_bands integer[], p_penalty integer) returns void
language plpgsql security definer set search_path = '' as $$
declare event public.competitions;
begin
  select * into event from public.competitions where id = p_id for update;
  if not found or not public.is_competition_admin(p_id) then raise exception 'Organizer access required'; end if;
  if event.status <> 'waiting' then raise exception 'Settings are locked'; end if;
  if p_capacity < (select count(*) from public.teams where competition_id = p_id) then raise exception 'Capacity is below the registered team count'; end if;
  update public.competitions set registration_open = p_open, starts_at = p_start, ends_at = p_end,
    team_capacity = p_capacity, prize_aed = p_prize, point_bands = p_bands, hint_penalty = p_penalty where id = p_id;
end $$;

create function public.save_checkpoint(p_challenge uuid, p_position integer, p_title text, p_question text,
  p_type text, p_expected text, p_tolerance numeric, p_variants text[], p_hint text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare event public.competitions; checkpoint uuid;
begin
  select c.* into event from public.competitions c join public.challenges ch on ch.competition_id = c.id
    where ch.id = p_challenge for update of c;
  if not found or not public.is_competition_admin(event.id) then raise exception 'Organizer access required'; end if;
  if event.status <> 'waiting' then raise exception 'Checkpoints are locked'; end if;
  if p_type = 'number' and trim(p_expected) !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' then raise exception 'Expected answer must be numeric'; end if;
  insert into public.checkpoints(challenge_id,position,title,question,answer_type) values (p_challenge,p_position,p_title,p_question,p_type)
    on conflict (challenge_id,position) do update set title=excluded.title, question=excluded.question, answer_type=excluded.answer_type returning id into checkpoint;
  insert into private.checkpoint_answers values (checkpoint,p_expected,p_tolerance,p_variants,p_hint)
    on conflict (checkpoint_id) do update set expected=excluded.expected, tolerance=excluded.tolerance, variants=excluded.variants, hint=excluded.hint;
  return checkpoint;
end $$;

create function public.start_competition(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare event public.competitions; squad record; chosen uuid; opened timestamptz;
begin
  select * into event from public.competitions where id = p_id for update;
  if not found or not public.is_competition_admin(p_id) then raise exception 'Organizer access required'; end if;
  if event.status <> 'waiting' then raise exception 'Event is already started or ended'; end if;
  if (select count(*) from public.challenges where competition_id = p_id) <> 4 then raise exception 'Configure four cases first'; end if;
  if exists (
    select 1 from public.challenges ch left join public.checkpoints cp on cp.challenge_id = ch.id
      left join private.checkpoint_answers ca on ca.checkpoint_id = cp.id
    where ch.competition_id = p_id group by ch.id
    having count(cp.id) = 0 or count(cp.id) <> max(cp.position) or count(cp.id) <> count(ca.checkpoint_id)
  ) then raise exception 'Cases must have consecutive checkpoints with answer keys'; end if;
  if (select count(distinct total) from (
    select count(*) as total from public.checkpoints cp join public.challenges ch on ch.id = cp.challenge_id
    where ch.competition_id = p_id group by ch.id
  ) counts) <> 1 then raise exception 'Cases must have the same number of checkpoints'; end if;
  opened := clock_timestamp();
  if event.ends_at <= opened then raise exception 'Event end time has passed'; end if;
  for squad in select id from public.teams where competition_id = p_id order by created_at, id loop
    if not exists (select 1 from public.team_assignments where team_id = squad.id) then
      select ch.id into chosen from public.challenges ch left join public.team_assignments a on a.challenge_id = ch.id
        where ch.competition_id = p_id group by ch.id,ch.slug order by count(a.team_id),ch.slug limit 1;
      insert into public.team_assignments values (squad.id,p_id,chosen);
    end if;
  end loop;
  insert into public.checkpoint_unlocks(team_id,checkpoint_id,unlocked_at)
    select a.team_id,cp.id,opened from public.team_assignments a join public.checkpoints cp on cp.challenge_id = a.challenge_id and cp.position = 1
    where a.competition_id = p_id;
  insert into public.leaderboard_scores(team_id,competition_id,team_name,track_slug)
    select a.team_id,p_id,t.name,ch.slug from public.team_assignments a join public.teams t on t.id = a.team_id
    join public.challenges ch on ch.id = a.challenge_id where a.competition_id = p_id;
  update public.competitions set status='active', registration_open=false, starts_at=opened where id=p_id;
end $$;

create function public.end_competition(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_competition_admin(p_id) then raise exception 'Organizer access required'; end if;
  update public.competitions set status='ended', ends_at=greatest(clock_timestamp(), starts_at + interval '1 microsecond')
    where id=p_id and status='active';
  if not found then raise exception 'Event is not active'; end if;
end $$;

-- Every attempt, hint and progression locks the same team row after the event row.
create function private.lock_active_checkpoint(p_team uuid, p_checkpoint uuid) returns public.checkpoint_unlocks
language plpgsql security definer set search_path = '' as $$
declare event public.competitions; opened public.checkpoint_unlocks;
begin
  select c.* into event from public.competitions c join public.team_members m on m.competition_id = c.id
    where m.team_id = p_team and m.user_id = auth.uid() for share of c;
  if not found or event.status <> 'active' then raise exception 'Competition access denied'; end if;
  perform 1 from public.teams where id = p_team for update;
  if event.ends_at <= clock_timestamp() then raise exception 'Competition has ended'; end if;
  select u.* into opened from public.checkpoint_unlocks u join public.team_assignments a on a.team_id = u.team_id
    join public.checkpoints cp on cp.id = u.checkpoint_id and cp.challenge_id = a.challenge_id
    where u.team_id = p_team and u.checkpoint_id = p_checkpoint and u.completed_at is null;
  if not found then raise exception 'Checkpoint is not available'; end if;
  return opened;
end $$;

create function public.reveal_checkpoint_hint(p_team uuid, p_checkpoint uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_active_checkpoint(p_team,p_checkpoint);
  insert into public.hint_usage(team_id,checkpoint_id,used_by) values(p_team,p_checkpoint,auth.uid()) on conflict do nothing;
  return (select hint from private.checkpoint_answers where checkpoint_id=p_checkpoint);
end $$;

create function private.normalize_answer(p_answer text, p_type text) returns text
language sql immutable set search_path = '' as $$
  select case when p_type = 'dax'
    then regexp_replace(replace(lower(p_answer), '''data''', 'data'), '[[:space:]]+', '', 'g')
    else trim(regexp_replace(lower(p_answer), '[[:space:]]+', ' ', 'g')) end;
$$;

create function public.submit_checkpoint(p_team uuid, p_checkpoint uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  opened public.checkpoint_unlocks; event public.competitions; key private.checkpoint_answers;
  cp public.checkpoints; accepted boolean := false; attempt uuid; next_checkpoint uuid;
  submitted timestamptz; seconds integer; penalty integer; awarded integer; band integer;
begin
  if p_answer is null or char_length(p_answer) > 500 or trim(p_answer) = '' then raise exception 'Enter a valid answer'; end if;
  opened := private.lock_active_checkpoint(p_team,p_checkpoint);
  submitted := clock_timestamp();
  if (select count(*) from public.submissions where team_id = p_team and submitted_at > submitted - interval '1 minute') >= 12 then
    raise exception 'Too many attempts. Try again in a minute.';
  end if;
  select c.* into strict event from public.competitions c join public.teams t on t.competition_id=c.id where t.id=p_team;
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
  seconds := greatest(0,ceil(extract(epoch from submitted-opened.unlocked_at))::integer);
  band := case when seconds <= 300 then 1 when seconds <= 600 then 2 when seconds <= 900 then 3 else 4 end;
  penalty := case when exists(select 1 from public.hint_usage where team_id=p_team and checkpoint_id=p_checkpoint) then event.hint_penalty else 0 end;
  awarded := greatest(0,event.point_bands[band]-penalty);
  insert into public.scoring_records values(p_team,p_checkpoint,attempt,awarded,seconds,penalty);
  update public.checkpoint_unlocks set completed_at=submitted where team_id=p_team and checkpoint_id=p_checkpoint;
  select id into next_checkpoint from public.checkpoints where challenge_id=cp.challenge_id and position=cp.position+1;
  if found then insert into public.checkpoint_unlocks(team_id,checkpoint_id,unlocked_at) values(p_team,next_checkpoint,submitted); end if;
  update public.leaderboard_scores set points=points+awarded, solved=solved+1, solving_seconds=solving_seconds+seconds where team_id=p_team;
  return jsonb_build_object('accepted',true,'points',awarded,'seconds',seconds,'next_checkpoint',next_checkpoint);
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
do $$
declare signature regprocedure;
begin
  for signature in select oid::regprocedure from pg_proc
    where pronamespace = 'public'::regnamespace and proname in (
      'is_competition_admin','can_view_team','is_team_captain','can_view_profile','can_view_checkpoint',
      'register_team','join_team','set_team_ready','assign_team','configure_competition','save_checkpoint',
      'start_competition','end_competition','reveal_checkpoint_hint','submit_checkpoint'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

alter publication supabase_realtime add table public.competitions, public.leaderboard_scores, public.checkpoint_unlocks;

commit;
