begin;

create function public.admin_import_checkpoints(p_competition uuid, p_challenge uuid, p_questions jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  event_status text;
  existing_count integer;
  entry record;
begin
  if not public.is_competition_admin(p_competition) then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;
  select status into event_status from public.competitions where id = p_competition for update;
  if event_status is distinct from 'waiting' then raise exception 'Checkpoints are locked'; end if;
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

create function public.admin_attach_dataset(p_competition uuid, p_challenge uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare event_status text;
begin
  if not public.is_competition_admin(p_competition) then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;
  select status into event_status from public.competitions where id = p_competition for update;
  if event_status is distinct from 'waiting' then raise exception 'Cases are locked at kickoff'; end if;
  if p_path is null or p_path !~ ('^' || p_competition::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}[.]csv$')
    or not exists (select 1 from storage.objects where bucket_id = 'competition-datasets' and name = p_path) then
    raise exception 'Uploaded CSV is unavailable';
  end if;
  update public.challenges set dataset_path = p_path where id = p_challenge and competition_id = p_competition;
  if not found then raise exception 'Challenge is unavailable'; end if;
end $$;

revoke all on function public.admin_import_checkpoints(uuid, uuid, jsonb), public.admin_attach_dataset(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_import_checkpoints(uuid, uuid, jsonb), public.admin_attach_dataset(uuid, uuid, text) to authenticated;

commit;
