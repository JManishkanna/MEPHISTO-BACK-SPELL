create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null check (url ~ '^https://'),
  icon_key text not null check (icon_key in ('github', 'linkedin', 'instagram', 'leetcode', 'website', 'youtube', 'x')),
  display_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.social_links enable row level security;
revoke all on public.social_links from anon, authenticated;
grant select on public.social_links to anon, authenticated;
grant insert, update, delete on public.social_links to authenticated;

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

insert into public.social_links (id, label, url, icon_key, display_order)
values
  ('00000000-0000-4000-8000-000000000001', 'GitHub', 'https://github.com/JManishkanna', 'github', 1),
  ('00000000-0000-4000-8000-000000000002', 'LinkedIn', 'https://www.linkedin.com/in/ManishKannaJ/', 'linkedin', 2),
  ('00000000-0000-4000-8000-000000000003', 'Instagram', 'https://www.instagram.com/am_mephisto_19', 'instagram', 3),
  ('00000000-0000-4000-8000-000000000004', 'LeetCode', 'https://leetcode.com/u/ManishKannaJ/', 'leetcode', 4)
on conflict (id) do nothing;
