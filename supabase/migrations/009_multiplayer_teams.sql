begin;

-- Registration, joining and starting all acquire the competition lock first.
lock table public.competitions in exclusive mode;
alter table public.team_members drop constraint one_account_per_team;

-- Legacy names and emails may describe fewer slots than the live roster.
alter table public.teams
  drop constraint team_roster_matches_size,
  drop constraint teams_teammate_email_count,
  add constraint team_roster_matches_size
    check (cardinality(teammate_names) <= seat_count - 1 and array_position(teammate_names, null) is null),
  add constraint teams_teammate_email_count
    check (teammate_emails is null or cardinality(teammate_emails) <= seat_count - 1);

create table public.team_join_codes (
  team_id uuid primary key references public.teams(id) on delete cascade,
  code uuid not null unique default gen_random_uuid()
);
alter table public.team_join_codes enable row level security;
revoke all on public.team_join_codes from public, anon, authenticated;
grant select on public.team_join_codes to authenticated;
create policy captain_reads_team_code on public.team_join_codes for select to authenticated
  using (public.is_team_captain(team_id));

insert into public.team_join_codes(team_id)
select id from public.teams where not private.team_has_begun(id);

create function public.create_player_team(p_competition uuid, p_team text, p_display text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare team uuid;
begin
  if auth.uid() is null or public.is_competition_admin(p_competition) then
    raise exception 'Sign in with a participant account' using errcode = '42501';
  end if;
  perform 1 from public.competitions where id = p_competition for update;
  if exists (select 1 from public.team_members where competition_id = p_competition and user_id = auth.uid()) then
    raise exception 'You already belong to a team';
  end if;
  if p_team is null or char_length(btrim(p_team)) not between 2 and 40 then
    raise exception 'Enter a team name between 2 and 40 characters';
  end if;
  if exists (select 1 from public.teams where competition_id = p_competition and lower(btrim(name)) = lower(btrim(p_team))) then
    raise exception 'That team name is already in use';
  end if;
  team := public.register_team(p_competition, p_team, p_display, 1, '{}'::text[]);
  insert into public.team_join_codes(team_id) values(team);
  return team;
end $$;

create function public.join_player_team(p_competition uuid, p_code uuid, p_display text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  event public.competitions;
  team uuid;
  membership uuid;
  members integer;
  player_name text := regexp_replace(p_display, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if auth.uid() is null or public.is_competition_admin(p_competition) then
    raise exception 'Sign in with a participant account' using errcode = '42501';
  end if;
  select * into event from public.competitions where id = p_competition for update;
  if not found or not event.registration_open then raise exception 'Registration is closed'; end if;
  select t.id into team from public.team_join_codes c join public.teams t on t.id = c.team_id
    where c.code = p_code and t.competition_id = p_competition for update of t;
  if not found then raise exception 'Team code is invalid or the team is unavailable'; end if;
  select team_id into membership from public.team_members where competition_id = p_competition and user_id = auth.uid();
  if membership = team then return team; end if;
  if membership is not null then raise exception 'You already belong to a team'; end if;
  if private.team_has_begun(team) then raise exception 'This team has already started'; end if;
  select count(*) into members from public.team_members where team_id = team;
  if members >= 3 then raise exception 'This team is full'; end if;
  if player_name is null or char_length(player_name) not between 1 and 40 then
    raise exception 'Enter a display name between 1 and 40 characters';
  end if;
  insert into public.profiles(id, display_name) values (auth.uid(), player_name)
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.team_members(competition_id, team_id, user_id) values (p_competition, team, auth.uid());
  -- Preserve legacy roster counts and contact records while tracking linked accounts.
  update public.teams set seat_count = greatest(seat_count, members + 1) where id = team;
  return team;
end $$;

revoke all on function public.create_player_team(uuid, text, text), public.join_player_team(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_player_team(uuid, text, text), public.join_player_team(uuid, uuid, text) to authenticated;
revoke execute on function public.register_team_with_contacts(uuid, text, text, integer, text[], text[]) from authenticated;
revoke execute on function public.register_team(uuid, text, text, integer, text[]) from authenticated;

create or replace function private.lock_active_checkpoint(p_team uuid, p_checkpoint uuid) returns public.checkpoint_unlocks
language plpgsql security definer set search_path = '' as $$
declare opened public.checkpoint_unlocks;
begin
  perform 1 from public.competitions c join public.team_members m on m.competition_id = c.id
    where m.team_id = p_team and m.user_id = auth.uid() for share of c;
  if not found then raise exception 'Competition access denied' using errcode = '42501'; end if;
  perform 1 from public.teams where id = p_team for update;
  select u.* into opened from public.checkpoint_unlocks u join public.team_assignments a on a.team_id = u.team_id
    join public.checkpoints cp on cp.id = u.checkpoint_id and cp.challenge_id = a.challenge_id
    where u.team_id = p_team and u.checkpoint_id = p_checkpoint;
  if not found then raise exception 'Checkpoint is not available'; end if;
  if opened.completed_at is not null then
    raise exception 'This checkpoint has already been solved by your team' using errcode = 'DQ001';
  end if;
  return opened;
end $$;

alter publication supabase_realtime add table public.team_members, public.hint_usage;
notify pgrst, 'reload schema';
commit;
