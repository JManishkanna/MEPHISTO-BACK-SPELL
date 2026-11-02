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
