begin;

create function private.valid_dataset_path(p_competition uuid, p_path text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_path ~ ('^' || p_competition::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}[.](csv|zip)$'), false);
$$;
revoke all on function private.valid_dataset_path(uuid, text) from public, anon, authenticated;

create or replace function public.admin_save_case(p_competition uuid, p_challenge uuid, p_name text, p_description text, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  perform 1 from public.competitions where id = p_competition for update;
  if private.track_has_begun(p_challenge) then raise exception 'A team has already begun this track'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 or p_description is null
    or char_length(trim(p_description)) not between 1 and 1000 or not private.valid_dataset_path(p_competition,p_path) then
    raise exception 'Enter a case name, description and an event-scoped CSV or ZIP object path';
  end if;
  update public.challenges set name=trim(p_name), description=trim(p_description), dataset_path=p_path
    where id=p_challenge and competition_id=p_competition;
  if not found then raise exception 'Challenge is unavailable'; end if;
end $$;

create or replace function public.admin_attach_dataset(p_competition uuid, p_challenge uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_competition_admin(p_competition) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  perform 1 from public.competitions where id = p_competition for update;
  if private.track_has_begun(p_challenge) then raise exception 'A team has already begun this track'; end if;
  if not private.valid_dataset_path(p_competition,p_path)
    or not exists (select 1 from storage.objects where bucket_id = 'competition-datasets' and name = p_path) then
    raise exception 'Uploaded dataset is unavailable';
  end if;
  update public.challenges set dataset_path = p_path where id = p_challenge and competition_id = p_competition;
  if not found then raise exception 'Challenge is unavailable'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
