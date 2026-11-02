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

alter table public.portfolio_skills_tools enable row level security;
revoke all on public.portfolio_skills_tools from anon, authenticated;
grant select on public.portfolio_skills_tools to anon, authenticated;
grant insert, update, delete on public.portfolio_skills_tools to authenticated;

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
