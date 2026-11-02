alter table public.portfolio_settings
  add column if not exists resume_url text not null default '/assets/pdfs/resume.pdf';

insert into storage.buckets (id, name, public)
values ('portfolio-resumes', 'portfolio-resumes', true)
on conflict (id) do update set public = true;

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
