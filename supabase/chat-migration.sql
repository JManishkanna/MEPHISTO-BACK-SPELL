create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null unique references auth.users(id) on delete cascade,
  visitor_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text;

alter table public.chat_messages
  drop constraint if exists chat_messages_body_check,
  drop constraint if exists chat_messages_attachment_pair,
  drop constraint if exists chat_messages_has_content,
  drop constraint if exists chat_messages_attachment_path;

alter table public.chat_messages
  add constraint chat_messages_body_check check (char_length(body) <= 2000),
  add constraint chat_messages_attachment_pair check (
    (attachment_path is null and attachment_name is null)
    or (attachment_path is not null and attachment_name is not null)
  ),
  add constraint chat_messages_has_content check (
    char_length(btrim(body)) > 0 or attachment_path is not null
  ),
  add constraint chat_messages_attachment_path check (
    attachment_path is null
    or (
      attachment_path like conversation_id::text || '/' || sender_id::text || '/%'
      and char_length(attachment_path) <= 1024
      and char_length(attachment_name) between 1 and 255
    )
  );

create index if not exists chat_messages_conversation_created_at_idx
  on public.chat_messages (conversation_id, created_at);

create or replace function public.update_chat_conversation_timestamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.update_chat_conversation_timestamp() from public, anon, authenticated;

drop trigger if exists chat_messages_update_conversation_timestamp on public.chat_messages;
create trigger chat_messages_update_conversation_timestamp
after insert on public.chat_messages
for each row execute function public.update_chat_conversation_timestamp();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

revoke all on public.chat_conversations, public.chat_messages from anon, authenticated;
grant select, insert on public.chat_conversations to authenticated;
grant select, insert on public.chat_messages to authenticated;

drop policy if exists "Visitors and admins can read chat conversations" on public.chat_conversations;
create policy "Visitors and admins can read chat conversations"
on public.chat_conversations for select to authenticated
using (visitor_id = (select auth.uid()) or (select public.is_portfolio_admin()));

drop policy if exists "Visitors can create their own chat conversation" on public.chat_conversations;
create policy "Visitors can create their own chat conversation"
on public.chat_conversations for insert to authenticated
with check (
  visitor_id = (select auth.uid())
  and lower(visitor_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and not (select public.is_portfolio_admin())
);

drop policy if exists "Visitors and admins can read chat messages" on public.chat_messages;
create policy "Visitors and admins can read chat messages"
on public.chat_messages for select to authenticated
using (
  (select public.is_portfolio_admin())
  or exists (
    select 1
    from public.chat_conversations
    where chat_conversations.id = chat_messages.conversation_id
      and chat_conversations.visitor_id = (select auth.uid())
  )
);

drop policy if exists "Visitors and admins can send chat messages" on public.chat_messages;
create policy "Visitors and admins can send chat messages"
on public.chat_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (
    (select public.is_portfolio_admin())
    or exists (
      select 1
      from public.chat_conversations
      where chat_conversations.id = chat_messages.conversation_id
        and chat_conversations.visitor_id = (select auth.uid())
    )
  )
);

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  seed_key text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_groups add column if not exists seed_key text;
create unique index if not exists chat_groups_seed_key_uidx
  on public.chat_groups (seed_key);

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

create table if not exists public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now(),
  constraint chat_group_messages_attachment_pair check (
    (attachment_path is null and attachment_name is null)
    or (attachment_path is not null and attachment_name is not null)
  ),
  constraint chat_group_messages_has_content check (
    char_length(btrim(body)) > 0 or attachment_path is not null
  ),
  constraint chat_group_messages_attachment_path check (
    attachment_path is null
    or (
      attachment_path like group_id::text || '/' || sender_id::text || '/%'
      and char_length(attachment_path) <= 1024
      and char_length(attachment_name) between 1 and 255
    )
  )
);

create index if not exists chat_group_messages_group_created_at_idx
  on public.chat_group_messages (group_id, created_at);

create or replace function public.update_chat_group_timestamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_groups
  set updated_at = now()
  where id = new.group_id;
  return new;
end;
$$;

revoke all on function public.update_chat_group_timestamp() from public, anon, authenticated;

drop trigger if exists chat_group_messages_update_group_timestamp on public.chat_group_messages;
create trigger chat_group_messages_update_group_timestamp
after insert on public.chat_group_messages
for each row execute function public.update_chat_group_timestamp();

create or replace function public.join_chat_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a chat room.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.chat_groups where id = p_group_id
  ) then
    raise exception 'Chat room not found.' using errcode = '22023';
  end if;

  insert into public.chat_group_members (group_id, member_id)
  values (p_group_id, auth.uid())
  on conflict (group_id, member_id) do nothing;
end;
$$;

revoke all on function public.join_chat_group(uuid) from public, anon;
grant execute on function public.join_chat_group(uuid) to authenticated;

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;

revoke all on public.chat_groups, public.chat_group_members, public.chat_group_messages from anon, authenticated;
grant select, insert on public.chat_groups to authenticated;
grant select, insert, delete on public.chat_group_members to authenticated;
grant select, insert on public.chat_group_messages to authenticated;

drop policy if exists "Members and admins can read chat groups" on public.chat_groups;
create policy "Members and admins can read chat groups"
on public.chat_groups for select to authenticated
using (
  (select public.is_portfolio_admin())
  or exists (
    select 1
    from public.chat_group_members
    where chat_group_members.group_id = chat_groups.id
      and chat_group_members.member_id = (select auth.uid())
  )
);

drop policy if exists "Admins can create chat groups" on public.chat_groups;
create policy "Admins can create chat groups"
on public.chat_groups for insert to authenticated
with check (
  (select public.is_portfolio_admin())
  and created_by = (select auth.uid())
);

drop policy if exists "Members and admins can read chat group memberships" on public.chat_group_members;
create policy "Members and admins can read chat group memberships"
on public.chat_group_members for select to authenticated
using (
  member_id = (select auth.uid())
  or (select public.is_portfolio_admin())
);

drop policy if exists "Admins can add chat group members" on public.chat_group_members;
create policy "Admins can add chat group members"
on public.chat_group_members for insert to authenticated
with check ((select public.is_portfolio_admin()));

drop policy if exists "Members can leave and admins can remove chat group members" on public.chat_group_members;
create policy "Members can leave and admins can remove chat group members"
on public.chat_group_members for delete to authenticated
using (
  member_id = (select auth.uid())
  or (select public.is_portfolio_admin())
);

drop policy if exists "Members and admins can read chat group messages" on public.chat_group_messages;
create policy "Members and admins can read chat group messages"
on public.chat_group_messages for select to authenticated
using (
  (select public.is_portfolio_admin())
  or exists (
    select 1
    from public.chat_group_members
    where chat_group_members.group_id = chat_group_messages.group_id
      and chat_group_members.member_id = (select auth.uid())
  )
);

drop policy if exists "Members and admins can send chat group messages" on public.chat_group_messages;
create policy "Members and admins can send chat group messages"
on public.chat_group_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (
    (select public.is_portfolio_admin())
    or exists (
      select 1
      from public.chat_group_members
      where chat_group_members.group_id = chat_group_messages.group_id
        and chat_group_members.member_id = (select auth.uid())
    )
  )
);

insert into public.chat_groups (name, seed_key, created_by)
values
  ('General', 'starter-general', null),
  ('Introductions', 'starter-introductions', null),
  ('Projects', 'starter-projects', null),
  ('Questions', 'starter-questions', null),
  ('Resources', 'starter-resources', null)
on conflict (seed_key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Chat participants can read private attachments" on storage.objects;
create policy "Chat participants can read private attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and (
    (select public.is_portfolio_admin())
    or exists (
      select 1
      from public.chat_conversations
      where chat_conversations.id::text = (storage.foldername(name))[1]
        and chat_conversations.visitor_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.chat_group_members
      where chat_group_members.group_id::text = (storage.foldername(name))[1]
        and chat_group_members.member_id = (select auth.uid())
    )
  )
);

drop policy if exists "Chat participants can upload private attachments" on storage.objects;
create policy "Chat participants can upload private attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (
    (
      (select public.is_portfolio_admin())
      and (
        exists (select 1 from public.chat_conversations where id::text = (storage.foldername(name))[1])
        or exists (select 1 from public.chat_groups where id::text = (storage.foldername(name))[1])
      )
    )
    or exists (
      select 1
      from public.chat_conversations
      where chat_conversations.id::text = (storage.foldername(name))[1]
        and chat_conversations.visitor_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.chat_group_members
      where chat_group_members.group_id::text = (storage.foldername(name))[1]
        and chat_group_members.member_id = (select auth.uid())
    )
  )
);

drop policy if exists "Chat participants can delete private attachments" on storage.objects;
create policy "Chat participants can delete private attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and (
    (select public.is_portfolio_admin())
    or (
      (storage.foldername(name))[2] = (select auth.uid())::text
      and (
        exists (
          select 1
          from public.chat_conversations
          where chat_conversations.id::text = (storage.foldername(name))[1]
            and chat_conversations.visitor_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.chat_group_members
          where chat_group_members.group_id::text = (storage.foldername(name))[1]
            and chat_group_members.member_id = (select auth.uid())
        )
      )
    )
  )
);
