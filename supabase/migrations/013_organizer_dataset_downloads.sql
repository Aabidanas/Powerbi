begin;

create policy organizer_reads_attached_dataset on storage.objects for select to authenticated using (
  bucket_id = 'competition-datasets' and exists (
    select 1 from public.challenges ch
    where ch.dataset_path = objects.name
      and ch.competition_id::text = split_part(objects.name, '/', 1)
      and public.is_competition_admin(ch.competition_id)
  )
);

create function public.admin_attached_datasets(p_competition uuid, p_challenge uuid default null)
returns table(challenge_id uuid, object_path text, original_name text, size_bytes text)
language sql stable security definer set search_path = '' as $$
  select ch.id, o.name, o.user_metadata->>'originalName', o.metadata->>'size'
  from public.challenges ch
  join storage.objects o on o.bucket_id='competition-datasets' and o.name=ch.dataset_path
  where ch.competition_id=p_competition
    and (p_challenge is null or ch.id=p_challenge)
    and ch.competition_id::text=split_part(o.name, '/', 1)
    and public.is_competition_admin(p_competition);
$$;

revoke all on function public.admin_attached_datasets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_attached_datasets(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
