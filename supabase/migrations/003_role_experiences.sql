begin;

-- Two manually assigned organizer accounts for this installation.
alter table public.admin_roles add column slot smallint;
with existing as (
  select competition_id, user_id, row_number() over (order by competition_id, user_id) as slot
  from public.admin_roles
)
update public.admin_roles r set slot = existing.slot
from existing where r.competition_id = existing.competition_id and r.user_id = existing.user_id;
alter table public.admin_roles alter column slot set not null;
alter table public.admin_roles add constraint two_organizer_slots check (slot in (1, 2));
alter table public.admin_roles add constraint organizer_slot_unique unique (slot);
alter table public.admin_roles add constraint organizer_account_unique unique (user_id);
revoke insert, update, delete, truncate, references, trigger on public.admin_roles from public, anon, authenticated;

create function public.admin_case_keys(p_competition uuid)
returns table(checkpoint_id uuid, expected text, tolerance numeric, variants text[], hint text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  return query select a.checkpoint_id, a.expected, a.tolerance, a.variants, a.hint
    from private.checkpoint_answers a join public.checkpoints p on p.id = a.checkpoint_id
    join public.challenges c on c.id = p.challenge_id where c.competition_id = p_competition;
end $$;

create function public.admin_recent_submissions(p_competition uuid)
returns table(id uuid, team_name text, checkpoint text, accepted boolean, submitted_at timestamptz, points integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  return query select s.id, t.name, p.title, s.accepted, s.submitted_at, sc.points
    from public.submissions s join public.teams t on t.id = s.team_id
    join public.checkpoints p on p.id = s.checkpoint_id
    left join public.scoring_records sc on sc.submission_id = s.id
    where t.competition_id = p_competition order by s.submitted_at desc, s.id desc limit 40;
end $$;

create function public.admin_remove_team(p_competition uuid, p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare event public.competitions;
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  select * into event from public.competitions where id = p_competition for update;
  if event.status <> 'waiting' then raise exception 'Registrations are locked at kickoff'; end if;
  delete from public.teams where id = p_team and competition_id = p_competition;
end $$;

create function public.admin_append_checkpoint(p_competition uuid, p_challenge uuid, p_title text, p_question text,
  p_type text, p_expected text, p_tolerance numeric, p_variants text[], p_hint text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare next_position integer;
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  perform 1 from public.competitions where id = p_competition for update;
  if not exists (select 1 from public.challenges where id = p_challenge and competition_id = p_competition)
    then raise exception 'Challenge is unavailable'; end if;
  select coalesce(max(position), 0) + 1 into next_position from public.checkpoints where challenge_id = p_challenge;
  return public.save_checkpoint(p_challenge, next_position, p_title, p_question, p_type, p_expected, p_tolerance, p_variants, p_hint);
end $$;

create function public.admin_save_case(p_competition uuid, p_challenge uuid, p_name text, p_description text, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare event public.competitions;
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  select * into event from public.competitions where id = p_competition for update;
  if event.status <> 'waiting' then raise exception 'Cases are locked at kickoff'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 or p_description is null
    or char_length(trim(p_description)) not between 1 and 1000 or p_path is null
    or p_path !~ ('^' || p_competition::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}[.]csv$') then
    raise exception 'Enter a case name, description and an event-scoped CSV object path';
  end if;
  update public.challenges set name=trim(p_name), description=trim(p_description), dataset_path=p_path
  where id=p_challenge and competition_id=p_competition;
  if not found then raise exception 'Challenge is unavailable'; end if;
end $$;

revoke all on function public.admin_case_keys(uuid), public.admin_recent_submissions(uuid),
  public.admin_remove_team(uuid, uuid), public.admin_save_case(uuid, uuid, text, text, text),
  public.admin_append_checkpoint(uuid, uuid, text, text, text, text, numeric, text[], text) from public, anon, authenticated;
grant execute on function public.admin_case_keys(uuid), public.admin_recent_submissions(uuid),
  public.admin_remove_team(uuid, uuid), public.admin_save_case(uuid, uuid, text, text, text),
  public.admin_append_checkpoint(uuid, uuid, text, text, text, text, numeric, text[], text) to authenticated;

insert into storage.buckets(id, name, public) values ('competition-datasets', 'competition-datasets', false);
create policy competition_csv_read on storage.objects for select to authenticated using (
  bucket_id = 'competition-datasets' and exists (
    select 1 from public.challenges ch join public.team_assignments a on a.challenge_id = ch.id
    join public.team_members m on m.team_id = a.team_id
    join public.competitions c on c.id = ch.competition_id
    where ch.dataset_path = objects.name and c.status in ('active','ended') and m.user_id = auth.uid()
  )
);
create policy competition_csv_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'competition-datasets' and exists (
    select 1 from public.competitions c where c.id::text = split_part(objects.name, '/', 1)
    and c.status = 'waiting' and public.is_competition_admin(c.id)
  )
);

commit;
