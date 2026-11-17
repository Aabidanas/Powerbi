begin;

alter table public.teams add column teammate_emails text[];
alter table public.teams add constraint teams_teammate_email_count
  check (teammate_emails is null or cardinality(teammate_emails) = seat_count - 1);

create function public.register_team_with_contacts(
  p_competition uuid, p_team text, p_display text, p_seats integer,
  p_teammates text[], p_emails text[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  captain_email text;
  emails text[];
  team_id uuid;
begin
  select lower(email) into captain_email from auth.users where id = auth.uid();
  if captain_email is null then raise exception 'Sign in with your captain email first'; end if;
  if public.is_competition_admin(p_competition) then raise exception 'Use a participant account to register a team'; end if;
  if p_seats is null or p_seats not between 1 and 3 or p_emails is null
    or cardinality(p_emails) <> p_seats - 1 then
    raise exception 'Provide an email for each teammate';
  end if;

  select coalesce(array_agg(lower(btrim(email)) order by position), '{}')
    into emails from unnest(p_emails) with ordinality as entries(email, position);
  if exists (select 1 from unnest(emails) as entries(email)
    where email is null or char_length(email) > 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'Enter a valid email for each teammate';
  end if;
  if captain_email = any(emails) or (select count(distinct email) from unnest(emails) as entries(email)) <> cardinality(emails) then
    raise exception 'Each participant needs a different email address';
  end if;

  team_id := public.register_team(p_competition, p_team, p_display, p_seats, p_teammates);
  update public.teams set teammate_emails = emails where id = team_id;
  return team_id;
end $$;

revoke execute on function public.register_team(uuid, text, text, integer, text[]) from public, anon, authenticated;
revoke all on function public.register_team_with_contacts(uuid, text, text, integer, text[], text[]) from public, anon, authenticated;
grant execute on function public.register_team_with_contacts(uuid, text, text, integer, text[], text[]) to authenticated;

commit;
