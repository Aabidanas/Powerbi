begin;

insert into public.competitions (slug, name)
values ('data-quest', 'DATA QUEST Championship')
on conflict (slug) do nothing;

insert into public.challenges (competition_id, slug, name, description, dataset_path)
select competition.id, track.slug, track.name, track.description, competition.id || '/' || track.slug || '.csv'
from public.competitions competition
cross join (values
  ('retail', 'Retail Intelligence', 'Analyze retail operations and revenue performance.'),
  ('fintech', 'Fintech Sentinel', 'Investigate financial transactions and risk patterns.'),
  ('supply', 'Supply Chain Command', 'Analyze freight, inventory, and delivery performance.'),
  ('health', 'Healthcare Telemetry', 'Explore operational trends in healthcare.')
) as track(slug, name, description)
where competition.slug = 'data-quest'
on conflict (competition_id, slug) do nothing;

commit;
