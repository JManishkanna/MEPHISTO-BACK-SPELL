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
