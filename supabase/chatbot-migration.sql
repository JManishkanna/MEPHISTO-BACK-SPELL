alter table public.chat_messages
  add column if not exists is_bot boolean not null default false;

update public.chat_messages as messages
set is_bot = true,
    sender_id = coalesce(
      (
        select admins.user_id
        from public.portfolio_admins as admins
        join auth.users as admin_users on admin_users.id = admins.user_id
        where admin_users.email_confirmed_at is not null
          and lower(admins.email) = lower(admin_users.email)
        limit 1
      ),
      messages.sender_id
    )
from public.chat_conversations as conversations
where conversations.id = messages.conversation_id
  and messages.sender_id = conversations.visitor_id
  and messages.body in (
    'Hi! Welcome to Mephisto chat. I am the automated assistant. Ask me about projects, skills, or how to get in touch with Manish.',
    'Hello! I can help with information about Manish''s projects, skills, and contact details. What would you like to know?',
    'You can explore Manish''s work on the Projects page. Tell me which project you are interested in, and Manish can share more details here.',
    'Manish''s technical skills are listed on the Skills page. If you have a question about a specific technology, leave it here for Manish.',
    'You can use the Contact page on the portfolio to reach Manish. You can also leave your project details here for him to follow up.',
    'You are welcome! Let me know if you have another question.',
    'Thanks for your message! I have saved it for Manish, and he can reply to you in this chat.'
  );

create table if not exists public.chat_bot_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true
);

alter table public.chat_bot_settings enable row level security;
revoke all on public.chat_bot_settings from public, anon, authenticated;

insert into public.chat_bot_settings (id, enabled)
values (true, true)
on conflict (id) do nothing;

create or replace function public.get_chatbot_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_portfolio_admin() then
    raise exception 'Only admins can inspect chatbot settings.' using errcode = '42501';
  end if;

  return coalesce((select enabled from public.chat_bot_settings where id), false);
end;
$$;

revoke all on function public.get_chatbot_enabled() from public, anon;
grant execute on function public.get_chatbot_enabled() to authenticated;

create or replace function public.set_chatbot_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_portfolio_admin() then
    raise exception 'Only admins can change chatbot settings.' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Choose whether automatic replies should be enabled.' using errcode = '22023';
  end if;

  insert into public.chat_bot_settings (id, enabled)
  values (true, p_enabled)
  on conflict (id) do update set enabled = excluded.enabled;

  return p_enabled;
end;
$$;

revoke all on function public.set_chatbot_enabled(boolean) from public, anon;
grant execute on function public.set_chatbot_enabled(boolean) to authenticated;

create table if not exists public.chat_bot_replies (
  id uuid primary key default gen_random_uuid(),
  keyword text not null check (
    char_length(btrim(keyword)) between 1 and 80
    and (
      keyword in ('*', '__greeting__')
      or btrim(regexp_replace(lower(keyword), '[^[:alnum:]]+', ' ', 'g')) <> ''
    )
  ),
  reply_text text not null check (char_length(btrim(reply_text)) between 1 and 2000),
  priority integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists chat_bot_replies_keyword_lower_uidx
  on public.chat_bot_replies (lower(keyword));

alter table public.chat_bot_replies enable row level security;
revoke all on public.chat_bot_replies from public, anon, authenticated;
grant select, insert, update, delete on public.chat_bot_replies to authenticated;

drop policy if exists "Admins can manage chatbot replies" on public.chat_bot_replies;
create policy "Admins can manage chatbot replies"
on public.chat_bot_replies for all to authenticated
using ((select public.is_portfolio_admin()))
with check ((select public.is_portfolio_admin()));

insert into public.chat_bot_replies (keyword, reply_text, priority)
select defaults.keyword, defaults.reply_text, defaults.priority
from (values
  ('hi', 'Hello! I can help with information about Manish''s projects, skills, and contact details. What would you like to know?', 10),
  ('hello', 'Hello! I can help with information about Manish''s projects, skills, and contact details. What would you like to know?', 10),
  ('hey', 'Hello! I can help with information about Manish''s projects, skills, and contact details. What would you like to know?', 10),
  ('project', 'You can explore Manish''s work on the Projects page. Tell me which project you are interested in, and Manish can share more details here.', 5),
  ('portfolio', 'You can explore Manish''s work on the Projects page. Tell me which project you are interested in, and Manish can share more details here.', 5),
  ('work', 'You can explore Manish''s work on the Projects page. Tell me which project you are interested in, and Manish can share more details here.', 5),
  ('github', 'You can explore Manish''s work on the Projects page. Tell me which project you are interested in, and Manish can share more details here.', 5),
  ('skill', 'Manish''s technical skills are listed on the Skills page. If you have a question about a specific technology, leave it here for Manish.', 5),
  ('technology', 'Manish''s technical skills are listed on the Skills page. If you have a question about a specific technology, leave it here for Manish.', 5),
  ('tech stack', 'Manish''s technical skills are listed on the Skills page. If you have a question about a specific technology, leave it here for Manish.', 5),
  ('contact', 'You can use the Contact page on the portfolio to reach Manish. You can also leave your project details here for him to follow up.', 5),
  ('email', 'You can use the Contact page on the portfolio to reach Manish. You can also leave your project details here for him to follow up.', 5),
  ('hire', 'You can use the Contact page on the portfolio to reach Manish. You can also leave your project details here for him to follow up.', 5),
  ('available', 'You can use the Contact page on the portfolio to reach Manish. You can also leave your project details here for him to follow up.', 5),
  ('thank', 'You are welcome! Let me know if you have another question.', 5),
  ('thanks', 'You are welcome! Let me know if you have another question.', 5),
  ('__greeting__', 'Hi! Welcome to Mephisto chat. I am the automated assistant. Ask me about projects, skills, or how to get in touch with Manish.', 1000),
  ('*', 'Thanks for your message! I have saved it for Manish, and he can reply to you in this chat.', -100)
) as defaults(keyword, reply_text, priority)
where not exists (
  select 1
  from public.chat_bot_replies as existing
  where lower(existing.keyword) = lower(defaults.keyword)
);

drop policy if exists "Visitors and admins can send chat messages" on public.chat_messages;
create policy "Visitors and admins can send chat messages"
on public.chat_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and is_bot = false
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

create or replace function public.create_chatbot_greeting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assistant_id uuid;
  greeting_text text;
begin
  if not coalesce((select enabled from public.chat_bot_settings where id), false) then
    return new;
  end if;

  select admins.user_id
  into assistant_id
  from public.portfolio_admins as admins
  join auth.users as admin_users on admin_users.id = admins.user_id
  where admin_users.email_confirmed_at is not null
    and lower(admins.email) = lower(admin_users.email)
  limit 1;

  select replies.reply_text
  into greeting_text
  from public.chat_bot_replies as replies
  where replies.keyword = '__greeting__'
    and replies.enabled
  limit 1;

  insert into public.chat_messages (conversation_id, sender_id, body, is_bot)
  values (
    new.id,
    coalesce(assistant_id, new.visitor_id),
    coalesce(greeting_text, 'Hi! Welcome to Mephisto chat. I am the automated assistant. Ask me about projects, skills, or how to get in touch with Manish.'),
    true
  );
  return new;
end;
$$;

revoke all on function public.create_chatbot_greeting() from public, anon, authenticated;

drop trigger if exists chat_conversations_bot_greeting on public.chat_conversations;
create trigger chat_conversations_bot_greeting
after insert on public.chat_conversations
for each row execute function public.create_chatbot_greeting();

insert into public.chat_messages (conversation_id, sender_id, body, is_bot)
select
  conversations.id,
  coalesce(
    (
      select admins.user_id
      from public.portfolio_admins as admins
      join auth.users as admin_users on admin_users.id = admins.user_id
      where admin_users.email_confirmed_at is not null
        and lower(admins.email) = lower(admin_users.email)
      limit 1
    ),
    conversations.visitor_id
  ),
  coalesce(
    (select replies.reply_text from public.chat_bot_replies as replies where replies.keyword = '__greeting__' and replies.enabled limit 1),
    'Hi! Welcome to Mephisto chat. I am the automated assistant. Ask me about projects, skills, or how to get in touch with Manish.'
  ),
  true
from public.chat_conversations as conversations
where not exists (
  select 1
  from public.chat_messages as messages
  where messages.conversation_id = conversations.id
)
and coalesce((select enabled from public.chat_bot_settings where id), false);

create or replace function public.create_chatbot_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_owner uuid;
  assistant_id uuid;
  message_text text;
  matched_reply text;
begin
  if new.is_bot
    or char_length(btrim(new.body)) = 0
    or not coalesce((select enabled from public.chat_bot_settings where id), false) then
    return new;
  end if;

  select conversations.visitor_id
  into conversation_owner
  from public.chat_conversations as conversations
  where conversations.id = new.conversation_id;

  if conversation_owner is null or new.sender_id <> conversation_owner then
    return new;
  end if;

  select admins.user_id
  into assistant_id
  from public.portfolio_admins as admins
  join auth.users as admin_users on admin_users.id = admins.user_id
  where admin_users.email_confirmed_at is not null
    and lower(admins.email) = lower(admin_users.email)
  limit 1;

  message_text := btrim(regexp_replace(lower(new.body), '[^[:alnum:]]+', ' ', 'g'));

  select replies.reply_text
  into matched_reply
  from public.chat_bot_replies as replies
  where replies.enabled
    and replies.keyword <> '__greeting__'
    and (
      replies.keyword = '*'
      or position(
        ' ' || btrim(regexp_replace(lower(replies.keyword), '[^[:alnum:]]+', ' ', 'g')) || ' '
        in ' ' || message_text || ' '
      ) > 0
    )
  order by (replies.keyword = '*'), replies.priority desc, char_length(replies.keyword) desc, replies.created_at
  limit 1;

  insert into public.chat_messages (conversation_id, sender_id, body, is_bot)
  values (
    new.conversation_id,
    coalesce(assistant_id, conversation_owner),
    coalesce(matched_reply, 'Thanks for your message! I have saved it for Manish, and he can reply to you in this chat.'),
    true
  );

  return new;
end;
$$;

revoke all on function public.create_chatbot_reply() from public, anon, authenticated;

drop trigger if exists chat_messages_bot_reply on public.chat_messages;
create trigger chat_messages_bot_reply
after insert on public.chat_messages
for each row execute function public.create_chatbot_reply();
