create or replace function public.replace_projects_from_github(p_projects jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  imported_count integer;
begin
  if not public.is_portfolio_admin() then
    raise exception 'Only portfolio admins can replace projects.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_projects) is distinct from 'array' or jsonb_array_length(p_projects) = 0 then
    raise exception 'A non-empty repository list is required.' using errcode = '22023';
  end if;

  delete from public.projects;

  insert into public.projects (
    slug, title, category, description, technologies, challenge, approach, outcome,
    preview_image_url, preview_type, github_owner, github_repo, live_demo_url, display_order, updated_at
  )
  select
    item ->> 'slug',
    item ->> 'title',
    coalesce(item ->> 'category', 'GitHub Repository'),
    coalesce(item ->> 'description', ''),
    array(select jsonb_array_elements_text(coalesce(item -> 'technologies', '[]'::jsonb))),
    coalesce(item ->> 'challenge', ''),
    coalesce(item ->> 'approach', ''),
    coalesce(item ->> 'outcome', ''),
    coalesce(item ->> 'preview_image_url', ''),
    coalesce(item ->> 'preview_type', 'screenshot'),
    coalesce(item ->> 'github_owner', ''),
    coalesce(item ->> 'github_repo', ''),
    coalesce(item ->> 'live_demo_url', ''),
    coalesce((item ->> 'display_order')::integer, ordinal::integer),
    now()
  from jsonb_array_elements(p_projects) with ordinality as repository(item, ordinal);

  get diagnostics imported_count = row_count;
  return imported_count;
end;
$$;

revoke all on function public.replace_projects_from_github(jsonb) from public, anon;
grant execute on function public.replace_projects_from_github(jsonb) to authenticated;
