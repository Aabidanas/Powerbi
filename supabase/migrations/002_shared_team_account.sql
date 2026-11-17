begin;

alter table public.teams add column teammate_names text[] not null default '{}';

-- Keep existing participants on the roster and retain the captain's login.
update public.teams t set teammate_names = array(
  select p.display_name
  from public.team_members m join public.profiles p on p.id = m.user_id
  where m.team_id = t.id and m.user_id <> t.captain_id
  order by m.user_id
);
update public.teams set seat_count = 1 + cardinality(teammate_names);
alter table public.teams add constraint team_roster_matches_size
  check (cardinality(teammate_names) = seat_count - 1 and array_position(teammate_names, null) is null);

delete from public.team_members m using public.teams t
where m.team_id = t.id and m.user_id <> t.captain_id;
alter table public.team_members add constraint one_account_per_team unique (team_id);

drop function public.join_team(uuid, text);
drop function public.register_team(uuid, text, text, integer);
drop table public.team_invites;

create function public.register_team(p_competition uuid, p_team text, p_display text, p_seats integer, p_teammates text[]) returns uuid
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
  if not found or not event.registration_open or event.status <> 'waiting'
    or event.starts_at <= clock_timestamp() or event.ends_at <= clock_timestamp() then raise exception 'Registration is closed'; end if;
  if (select count(*) from public.teams where competition_id = p_competition) >= event.team_capacity then raise exception 'Competition is full'; end if;
  insert into public.profiles(id, display_name) values (auth.uid(), captain_name)
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.teams(competition_id, name, seat_count, captain_id, teammate_names)
    values (p_competition, trim(p_team), p_seats, auth.uid(), roster) returning id into new_team;
  insert into public.team_members values (p_competition, new_team, auth.uid());
  return new_team;
end $$;

revoke all on function public.register_team(uuid, text, text, integer, text[]) from public, anon, authenticated;
grant execute on function public.register_team(uuid, text, text, integer, text[]) to authenticated;

commit;
