begin;

-- The public catalogue exposes challenge names and descriptions only.
create function public.competition_catalogue(p_competition uuid)
returns table (slug text, name text, description text)
language sql stable security definer set search_path = '' as $$
  select c.slug, c.name, c.description
  from public.challenges c
  where c.competition_id = p_competition
  order by c.slug;
$$;
revoke all on function public.competition_catalogue(uuid) from public, anon, authenticated;
grant execute on function public.competition_catalogue(uuid) to anon, authenticated;

commit;
