create table if not exists public.portfolio_admins (
  email text primary key,
  user_id uuid references auth.users(id) on delete cascade
);

alter table public.portfolio_admins
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists portfolio_admins_user_id_uidx
  on public.portfolio_admins (user_id)
  where user_id is not null;

alter table public.portfolio_admins enable row level security;
revoke all on public.portfolio_admins from public, anon, authenticated;

create or replace function public.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portfolio_admins as admins
    join auth.users as admin_users on admin_users.id = admins.user_id
    where admins.user_id = (select auth.uid())
      and admin_users.email_confirmed_at is not null
      and lower(admins.email) = lower(admin_users.email)
  );
$$;

revoke all on function public.is_portfolio_admin() from public;
grant execute on function public.is_portfolio_admin() to anon, authenticated;

create table if not exists public.portfolio_settings (
  id integer primary key check (id = 1),
  github_username text not null default '',
  resume_url text not null default '/assets/pdfs/resume.pdf',
  updated_at timestamptz not null default now()
);

alter table public.portfolio_settings
  add column if not exists resume_url text not null default '/assets/pdfs/resume.pdf';

insert into public.portfolio_settings (id, github_username)
values (1, '')
on conflict (id) do nothing;

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null check (url ~ '^https://'),
  icon_key text not null check (icon_key in ('github', 'linkedin', 'instagram', 'leetcode', 'website', 'youtube', 'x')),
  display_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.social_links (id, label, url, icon_key, display_order)
values
  ('00000000-0000-4000-8000-000000000001', 'GitHub', 'https://github.com/JManishkanna', 'github', 1),
  ('00000000-0000-4000-8000-000000000002', 'LinkedIn', 'https://www.linkedin.com/in/ManishKannaJ/', 'linkedin', 2),
  ('00000000-0000-4000-8000-000000000003', 'Instagram', 'https://www.instagram.com/am_mephisto_19', 'instagram', 3),
  ('00000000-0000-4000-8000-000000000004', 'LeetCode', 'https://leetcode.com/u/ManishKannaJ/', 'leetcode', 4)
on conflict (id) do nothing;

create table if not exists public.projects (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  category text not null default '',
  description text not null default '',
  technologies text[] not null default '{}',
  challenge text not null default '',
  approach text not null default '',
  outcome text not null default '',
  preview_image_url text not null default '',
  preview_type text not null default 'screenshot' check (preview_type in ('concept', 'screenshot')),
  github_owner text not null default '',
  github_repo text not null default '',
  live_demo_url text not null default '',
  display_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.projects (
  slug, title, category, description, technologies, challenge, approach, outcome,
  preview_image_url, preview_type, display_order
)
values
  (
    'mental-health-recovery',
    'Mental Health & Recovery Management System',
    'Desktop App',
    'A desktop application for managing patient records, recovery tracking, and mental health data with full CRUD operations.',
    array['Java', 'MySQL', 'Tkinter'],
    'Keep patient records and recovery progress organized in one practical workflow.',
    'Use create, read, update, and delete operations to manage records and track recovery progress.',
    'A desktop workflow for maintaining patient information and recovery records.',
    'assets/images/project-previews/mental-health.svg',
    'concept',
    1
  ),
  (
    'recovery-counselling-database',
    'Addiction Recovery and Behavioural Counselling System',
    'Database Project',
    'A SQL-focused database solution for counselling, patient progress tracking, and program reporting workflows.',
    array['MySQL', 'SQL', 'Reports'],
    'Organize counselling information and patient progress for clearer program reporting.',
    'Use a relational database and SQL reporting workflows to support counselling and progress tracking.',
    'A database-focused solution for counselling workflows and program reports.',
    'assets/images/project-previews/counselling.svg',
    'concept',
    2
  ),
  (
    'smart-irrigation',
    'AI-Based Smart Irrigation System',
    'IoT',
    'An intelligent irrigation system using weather prediction and sensor-based automation to reduce water waste and improve efficiency.',
    array['ESP32', 'IoT', 'API'],
    'Reduce water waste by making irrigation decisions with sensor readings and weather information.',
    'Combine ESP32 sensor data with weather information to support automated irrigation decisions.',
    'An IoT project concept focused on sensor-aware irrigation and more efficient water use.',
    'assets/images/project-previews/irrigation.svg',
    'concept',
    3
  )
on conflict (slug) do nothing;

create table if not exists public.portfolio_skills_tools (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('skill', 'tool')),
  name text not null,
  description text not null default '',
  status text not null default '',
  icon_class text not null check (icon_class ~ '^(fab|fas|far) fa-[a-z0-9-]+$'),
  display_order integer not null default 0,
  updated_at timestamptz not null default now(),
  check (
    (entry_type = 'skill' and status in ('Completed', 'Ongoing', 'Planned') and description = '')
    or (entry_type = 'tool' and status = '')
  )
);

insert into public.portfolio_skills_tools (id, entry_type, name, description, status, icon_class, display_order)
values
  ('00000000-0000-4000-8000-000000000101', 'skill', 'java', '', 'Completed', 'fab fa-java', 1),
  ('00000000-0000-4000-8000-000000000102', 'skill', 'MySQL', '', 'Completed', 'fas fa-database', 2),
  ('00000000-0000-4000-8000-000000000103', 'skill', 'HTML', '', 'Completed', 'fab fa-html5', 3),
  ('00000000-0000-4000-8000-000000000104', 'skill', 'CSS', '', 'Completed', 'fab fa-css3-alt', 4),
  ('00000000-0000-4000-8000-000000000105', 'skill', 'JavaScript', '', 'Completed', 'fab fa-js', 5),
  ('00000000-0000-4000-8000-000000000106', 'skill', 'React.js', '', 'Ongoing', 'fab fa-react', 6),
  ('00000000-0000-4000-8000-000000000107', 'skill', 'MongoDB', '', 'Ongoing', 'fas fa-leaf', 7),
  ('00000000-0000-4000-8000-000000000108', 'skill', 'three.js', '', 'Planned', 'fas fa-server', 8),
  ('00000000-0000-4000-8000-000000000109', 'skill', 'Express.js', '', 'Planned', 'fas fa-cubes', 9),
  ('00000000-0000-4000-8000-000000000110', 'skill', 'Node.js', '', 'Planned', 'fab fa-node-js', 10),
  ('00000000-0000-4000-8000-000000000201', 'tool', 'intellij IDEA', 'java IDE', '', 'fas fa-terminal', 1),
  ('00000000-0000-4000-8000-000000000202', 'tool', 'VS Code', 'Code Editor', '', 'fas fa-code', 2),
  ('00000000-0000-4000-8000-000000000203', 'tool', 'MySQL', 'Database Tool', '', 'fas fa-database', 3),
  ('00000000-0000-4000-8000-000000000204', 'tool', 'Git', 'Version Control', '', 'fab fa-git-alt', 4),
  ('00000000-0000-4000-8000-000000000205', 'tool', 'GitHub', 'Code Hosting', '', 'fab fa-github', 5)
on conflict (id) do nothing;

alter table public.portfolio_settings enable row level security;
alter table public.projects enable row level security;
alter table public.social_links enable row level security;
alter table public.portfolio_skills_tools enable row level security;

revoke all on public.portfolio_settings from anon, authenticated;
revoke all on public.projects from anon, authenticated;
revoke all on public.social_links from anon, authenticated;
revoke all on public.portfolio_skills_tools from anon, authenticated;
grant select on public.portfolio_settings, public.projects to anon, authenticated;
grant select on public.social_links to anon, authenticated;
grant select on public.portfolio_skills_tools to anon, authenticated;
grant insert, update, delete on public.portfolio_settings, public.projects to authenticated;
grant insert, update, delete on public.social_links to authenticated;
grant insert, update, delete on public.portfolio_skills_tools to authenticated;

drop policy if exists "Public can read portfolio settings" on public.portfolio_settings;
create policy "Public can read portfolio settings"
on public.portfolio_settings for select to anon, authenticated
using (true);

drop policy if exists "Admins can update portfolio settings" on public.portfolio_settings;
create policy "Admins can update portfolio settings"
on public.portfolio_settings for update to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

drop policy if exists "Public can read projects" on public.projects;
create policy "Public can read projects"
on public.projects for select to anon, authenticated
using (true);

drop policy if exists "Admins can create projects" on public.projects;
create policy "Admins can create projects"
on public.projects for insert to authenticated
with check (public.is_portfolio_admin());

drop policy if exists "Admins can update projects" on public.projects;
create policy "Admins can update projects"
on public.projects for update to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

drop policy if exists "Admins can delete projects" on public.projects;
create policy "Admins can delete projects"
on public.projects for delete to authenticated
using (public.is_portfolio_admin());

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

drop policy if exists "Public can read social links" on public.social_links;
create policy "Public can read social links"
on public.social_links for select to anon, authenticated
using (true);

drop policy if exists "Admins can create social links" on public.social_links;
create policy "Admins can create social links"
on public.social_links for insert to authenticated
with check (public.is_portfolio_admin());

drop policy if exists "Admins can update social links" on public.social_links;
create policy "Admins can update social links"
on public.social_links for update to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

drop policy if exists "Admins can delete social links" on public.social_links;
create policy "Admins can delete social links"
on public.social_links for delete to authenticated
using (public.is_portfolio_admin());

drop policy if exists "Public can read skills and tools" on public.portfolio_skills_tools;
create policy "Public can read skills and tools"
on public.portfolio_skills_tools for select to anon, authenticated
using (true);

drop policy if exists "Admins can create skills and tools" on public.portfolio_skills_tools;
create policy "Admins can create skills and tools"
on public.portfolio_skills_tools for insert to authenticated
with check (public.is_portfolio_admin());

drop policy if exists "Admins can update skills and tools" on public.portfolio_skills_tools;
create policy "Admins can update skills and tools"
on public.portfolio_skills_tools for update to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

drop policy if exists "Admins can delete skills and tools" on public.portfolio_skills_tools;
create policy "Admins can delete skills and tools"
on public.portfolio_skills_tools for delete to authenticated
using (public.is_portfolio_admin());

insert into storage.buckets (id, name, public)
values ('project-images', 'project-images', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('portfolio-resumes', 'portfolio-resumes', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view project images" on storage.objects;
create policy "Public can view project images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'project-images');

drop policy if exists "Admins can upload project images" on storage.objects;
create policy "Admins can upload project images"
on storage.objects for insert to authenticated
with check (bucket_id = 'project-images' and public.is_portfolio_admin());

drop policy if exists "Admins can update project images" on storage.objects;
create policy "Admins can update project images"
on storage.objects for update to authenticated
using (bucket_id = 'project-images' and public.is_portfolio_admin())
with check (bucket_id = 'project-images' and public.is_portfolio_admin());

drop policy if exists "Admins can delete project images" on storage.objects;
create policy "Admins can delete project images"
on storage.objects for delete to authenticated
using (bucket_id = 'project-images' and public.is_portfolio_admin());

drop policy if exists "Public can view portfolio resumes" on storage.objects;
create policy "Public can view portfolio resumes"
on storage.objects for select to anon, authenticated
using (bucket_id = 'portfolio-resumes');

drop policy if exists "Admins can upload portfolio resumes" on storage.objects;
create policy "Admins can upload portfolio resumes"
on storage.objects for insert to authenticated
with check (bucket_id = 'portfolio-resumes' and public.is_portfolio_admin());

drop policy if exists "Admins can delete portfolio resumes" on storage.objects;
create policy "Admins can delete portfolio resumes"
on storage.objects for delete to authenticated
using (bucket_id = 'portfolio-resumes' and public.is_portfolio_admin());

-- After creating and verifying the admin user in Supabase Auth, bind the
-- confirmed account's UUID from the Auth dashboard to its email allowlist row.
-- Do not bind a visitor account based only on its email address.
-- insert into public.portfolio_admins (email, user_id)
-- values ('your-admin@example.com', 'AUTH-USER-UUID')
-- on conflict (email) do update set user_id = excluded.user_id;
