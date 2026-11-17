begin;

-- The competition row serializes assignment and content changes with team entry.
create function private.team_has_begun(p_team uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.checkpoint_unlocks where team_id = p_team);
$$;

create function private.track_has_begun(p_challenge uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.checkpoint_unlocks u
    join public.checkpoints cp on cp.id = u.checkpoint_id where cp.challenge_id = p_challenge);
$$;

revoke all on function private.team_has_begun(uuid), private.track_has_begun(uuid) from public, anon, authenticated;

create function public.begin_team_challenge(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  squad public.teams;
  chosen uuid;
  first_checkpoint uuid;
begin
  select * into squad from public.teams where id = p_team and captain_id = auth.uid();
  if not found then raise exception 'Captain access required' using errcode = '42501'; end if;
  perform 1 from public.competitions where id = squad.competition_id for update;
  select * into squad from public.teams where id = p_team and captain_id = auth.uid() for update;
  if not found then raise exception 'Team is unavailable'; end if;
  if private.team_has_begun(p_team) then return; end if;
  if (select count(*) from public.challenges where competition_id = squad.competition_id) <> 4 or exists (
    select 1 from public.challenges c
    left join public.checkpoints cp on cp.challenge_id = c.id
    left join private.checkpoint_answers k on k.checkpoint_id = cp.id
    where c.competition_id = squad.competition_id
    group by c.id, c.dataset_path
    having count(cp.id) = 0 or count(cp.id) <> max(cp.position) or count(cp.id) <> count(k.checkpoint_id)
      or not exists (select 1 from storage.objects o where o.bucket_id = 'competition-datasets' and o.name = c.dataset_path)
  ) or (select count(distinct total) from (
    select count(*) as total from public.checkpoints cp join public.challenges c on c.id = cp.challenge_id
    where c.competition_id = squad.competition_id group by c.id
  ) counts) <> 1 then
    raise exception 'The challenge files and checkpoints are still being prepared. Try again once the organizer has finished.';
  end if;

  select challenge_id into chosen from public.team_assignments where team_id = p_team;
  if chosen is null then
    select c.id into chosen from public.challenges c left join public.team_assignments a on a.challenge_id = c.id
      where c.competition_id = squad.competition_id group by c.id, c.slug order by count(a.team_id), c.slug limit 1;
    insert into public.team_assignments values (p_team, squad.competition_id, chosen);
  end if;
  select id into strict first_checkpoint from public.checkpoints where challenge_id = chosen and position = 1;
  insert into public.checkpoint_unlocks (team_id, checkpoint_id, unlocked_at)
    values (p_team, first_checkpoint, clock_timestamp());
  insert into public.leaderboard_scores (team_id, competition_id, team_name, track_slug)
    select p_team, squad.competition_id, squad.name, slug from public.challenges where id = chosen
    on conflict (team_id) do nothing;
end $$;

create function public.set_registration_open(p_competition uuid, p_open boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  update public.competitions set registration_open = p_open where id = p_competition;
end $$;

revoke all on function public.begin_team_challenge(uuid), public.set_registration_open(uuid, boolean) from public, anon, authenticated;
grant execute on function public.begin_team_challenge(uuid), public.set_registration_open(uuid, boolean) to authenticated;

drop function public.start_competition(uuid);
drop function public.end_competition(uuid);
drop function public.configure_competition(uuid, boolean, timestamptz, timestamptz, integer, integer, integer[], integer);

drop policy assignment_read on public.team_assignments;
create policy assignment_read on public.team_assignments for select to authenticated using (public.can_view_team(team_id));

drop policy competition_csv_read on storage.objects;
create policy competition_csv_read on storage.objects for select to authenticated using (
  bucket_id = 'competition-datasets' and exists (
    select 1 from public.challenges ch join public.team_assignments a on a.challenge_id = ch.id
    join public.team_members m on m.team_id = a.team_id
    join public.checkpoint_unlocks u on u.team_id = a.team_id
    where ch.dataset_path = objects.name and m.user_id = auth.uid()
  )
);
drop policy competition_csv_upload on storage.objects;
create policy competition_csv_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'competition-datasets' and exists (
    select 1 from public.competitions c where c.id::text = split_part(objects.name, '/', 1)
    and public.is_competition_admin(c.id)
  )
);

create or replace function public.register_team(p_competition uuid, p_team text, p_display text, p_seats integer, p_teammates text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  event public.competitions;
  new_team uuid;
  captain_name text := regexp_replace(p_display, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  roster text[];
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_seats is null or p_seats not between 1 and 3 or p_teammates is null
    or cardinality(p_teammates) <> p_seats - 1 then
    raise exception 'Provide a roster of one to three analysts including the captain';
  end if;
  select coalesce(array_agg(regexp_replace(name, '^[[:space:]]+|[[:space:]]+$', '', 'g') order by position), '{}')
  into roster from unnest(p_teammates) with ordinality as entries(name, position);
  if captain_name is null or char_length(captain_name) not between 1 and 40
    or exists(select 1 from unnest(roster) as names(name) where name is null or char_length(name) not between 1 and 40) then
    raise exception 'Enter a display name for every team member';
  end if;
  select * into event from public.competitions where id = p_competition for update;
  if not found or not event.registration_open then raise exception 'Registration is closed'; end if;
  if (select count(*) from public.teams where competition_id = p_competition) >= event.team_capacity then raise exception 'Competition is full'; end if;
  insert into public.profiles(id, display_name) values (auth.uid(), captain_name)
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.teams(competition_id, name, seat_count, captain_id, teammate_names)
    values (p_competition, trim(p_team), p_seats, auth.uid(), roster) returning id into new_team;
  insert into public.team_members values (p_competition, new_team, auth.uid());
  return new_team;
end $$;

create or replace function public.assign_team(p_team uuid, p_challenge uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare event public.competitions;
begin
  select c.* into event from public.competitions c join public.teams t on t.competition_id = c.id where t.id = p_team for update of c;
  if not found or not public.is_competition_admin(event.id) then raise exception 'Organizer access required'; end if;
  if private.team_has_begun(p_team) then raise exception 'This team has already begun'; end if;
  if p_challenge is null then delete from public.team_assignments where team_id = p_team;
  else insert into public.team_assignments values (p_team,event.id,p_challenge)
    on conflict (team_id) do update set challenge_id = excluded.challenge_id;
  end if;
end $$;

create or replace function public.admin_remove_team(p_competition uuid, p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare event public.competitions;
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  select * into event from public.competitions where id = p_competition for update;
  if private.team_has_begun(p_team) then raise exception 'This team has already begun'; end if;
  delete from public.teams where id = p_team and competition_id = p_competition;
end $$;

create or replace function public.save_checkpoint(p_challenge uuid, p_position integer, p_title text, p_question text,
  p_type text, p_expected text, p_tolerance numeric, p_variants text[], p_hint text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare event public.competitions; checkpoint uuid;
begin
  select c.* into event from public.competitions c join public.challenges ch on ch.competition_id = c.id
    where ch.id = p_challenge for update of c;
  if not found or not public.is_competition_admin(event.id) then raise exception 'Organizer access required'; end if;
  if private.track_has_begun(p_challenge) then raise exception 'A team has already begun this track'; end if;
  if not exists(select 1 from public.checkpoints where challenge_id = p_challenge and position = p_position)
    and exists(select 1 from public.leaderboard_scores where competition_id = event.id) then
    raise exception 'Checkpoint counts are fixed once a team begins';
  end if;
  if p_type = 'number' and trim(p_expected) !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' then raise exception 'Expected answer must be numeric'; end if;
  insert into public.checkpoints(challenge_id,position,title,question,answer_type) values (p_challenge,p_position,p_title,p_question,p_type)
    on conflict (challenge_id,position) do update set title=excluded.title, question=excluded.question, answer_type=excluded.answer_type returning id into checkpoint;
  insert into private.checkpoint_answers values (checkpoint,p_expected,p_tolerance,p_variants,p_hint)
    on conflict (checkpoint_id) do update set expected=excluded.expected, tolerance=excluded.tolerance, variants=excluded.variants, hint=excluded.hint;
  return checkpoint;
end $$;

create or replace function public.admin_save_case(p_competition uuid, p_challenge uuid, p_name text, p_description text, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare event public.competitions;
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  select * into event from public.competitions where id = p_competition for update;
  if private.track_has_begun(p_challenge) then raise exception 'A team has already begun this track'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 or p_description is null
    or char_length(trim(p_description)) not between 1 and 1000 or p_path is null
    or p_path !~ ('^' || p_competition::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}[.]csv$') then
    raise exception 'Enter a case name, description and an event-scoped CSV object path';
  end if;
  update public.challenges set name=trim(p_name), description=trim(p_description), dataset_path=p_path
  where id=p_challenge and competition_id=p_competition;
  if not found then raise exception 'Challenge is unavailable'; end if;
end $$;

create or replace function public.admin_import_checkpoints(p_competition uuid, p_challenge uuid, p_questions jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  existing_count integer;
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
    perform public.save_checkpoint(p_challenge, entry.position::integer, entry.value->>'title', entry.value->>'question',
      entry.value->>'type', entry.value->>'expected', coalesce((entry.value->>'tolerance')::numeric, 0),
      array(select jsonb_array_elements_text(coalesce(entry.value->'variants', '[]'::jsonb))), entry.value->>'hint');
  end loop;
end $$;

create or replace function public.admin_attach_dataset(p_competition uuid, p_challenge uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_competition_admin(p_competition) then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;
  perform 1 from public.competitions where id = p_competition for update;
  if private.track_has_begun(p_challenge) then raise exception 'A team has already begun this track'; end if;
  if p_path is null or p_path !~ ('^' || p_competition::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}[.]csv$')
    or not exists (select 1 from storage.objects where bucket_id = 'competition-datasets' and name = p_path) then
    raise exception 'Uploaded CSV is unavailable';
  end if;
  update public.challenges set dataset_path = p_path where id = p_challenge and competition_id = p_competition;
  if not found then raise exception 'Challenge is unavailable'; end if;
end $$;

create or replace function private.lock_active_checkpoint(p_team uuid, p_checkpoint uuid) returns public.checkpoint_unlocks
language plpgsql security definer set search_path = '' as $$
declare event public.competitions; opened public.checkpoint_unlocks;
begin
  select c.* into event from public.competitions c join public.team_members m on m.competition_id = c.id
    where m.team_id = p_team and m.user_id = auth.uid() for share of c;
  if not found then raise exception 'Competition access denied'; end if;
  perform 1 from public.teams where id = p_team for update;
  select u.* into opened from public.checkpoint_unlocks u join public.team_assignments a on a.team_id = u.team_id
    join public.checkpoints cp on cp.id = u.checkpoint_id and cp.challenge_id = a.challenge_id
    where u.team_id = p_team and u.checkpoint_id = p_checkpoint and u.completed_at is null;
  if not found then raise exception 'Checkpoint is not available'; end if;
  return opened;
end $$;

commit;
