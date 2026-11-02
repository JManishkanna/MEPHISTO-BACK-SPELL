grant delete on public.chat_groups to authenticated;

drop policy if exists "Admins can delete chat groups" on public.chat_groups;
create policy "Admins can delete chat groups"
on public.chat_groups for delete to authenticated
using ((select public.is_portfolio_admin()));

create or replace function public.get_chat_group_presence(p_group_id uuid)
returns table (display_name text, is_online boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or (
    not public.is_portfolio_admin()
    and not exists (
      select 1
      from public.chat_group_members
      where group_id = p_group_id
        and member_id = auth.uid()
    )
  ) then
    raise exception 'You cannot view presence for this chat group.' using errcode = '42501';
  end if;

  return query
  select
    coalesce(profiles.display_name, 'Group member'),
    coalesce(presence.last_seen_at > now() - interval '90 seconds', false)
  from public.chat_group_members as members
  left join public.chat_profiles as profiles on profiles.user_id = members.member_id
  left join public.chat_presence as presence on presence.user_id = members.member_id
  where members.group_id = p_group_id
  order by lower(coalesce(profiles.display_name, 'Group member'));
end;
$$;

revoke all on function public.get_chat_group_presence(uuid) from public, anon;
grant execute on function public.get_chat_group_presence(uuid) to authenticated;
