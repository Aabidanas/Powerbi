begin;

create function private.new_short_team_code() returns text
language sql volatile set search_path = '' as $$
  -- Skip the version byte. The low five bits of each sampled byte are random.
  select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
    1 + (get_byte(seed.bytes, part.byte_index) & 31), 1), '' order by part.byte_index)
  from (select uuid_send(gen_random_uuid()) as bytes) seed
  cross join unnest(array[0,1,2,3,4,5,7,8]) as part(byte_index);
$$;
revoke all on function private.new_short_team_code() from public, anon, authenticated;

alter table public.team_join_codes add column short_code text not null default private.new_short_team_code()
  check (short_code ~ '^[2-9A-HJ-NP-Z]{8}$');
alter table public.team_join_codes add constraint team_join_codes_short_code_key unique (short_code);

create function public.join_player_team_with_code(p_competition uuid, p_team_code text, p_display text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  input text := btrim(p_team_code);
  normalized text;
  invite uuid;
begin
  if auth.uid() is null or public.is_competition_admin(p_competition) then
    raise exception 'Sign in with a participant account' using errcode = '42501';
  end if;
  if input is null or char_length(input) > 48 then
    raise exception 'Enter the team code from your captain';
  end if;
  if input ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
    return public.join_player_team(p_competition, input::uuid, p_display);
  end if;
  normalized := upper(regexp_replace(input, '[[:space:]-]+', '', 'g'));
  if normalized !~ '^[2-9A-HJ-NP-Z]{8}$' then raise exception 'Enter the 8-character team code'; end if;
  select c.code into invite from public.team_join_codes c join public.teams t on t.id = c.team_id
    where c.short_code = normalized and t.competition_id = p_competition;
  if not found then raise exception 'Team code is invalid or the team is unavailable'; end if;
  return public.join_player_team(p_competition, invite, p_display);
end $$;

revoke all on function public.join_player_team_with_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.join_player_team_with_code(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
