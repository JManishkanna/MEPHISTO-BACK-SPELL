# Portfolio services setup

## Supabase admin portal

1. Create a Supabase project.
2. Run [`schema.sql`](./schema.sql) in the Supabase SQL Editor. It creates the public project/settings/social-link tables, RLS policies, starter links, and a public image bucket. Public visitors can read content; only explicitly bound admins can write.
3. Run [`chat-migration.sql`](./chat-migration.sql) in the Supabase SQL Editor to enable private visitor chats, five starter group rooms, group membership/message tables, private attachment and profile-image buckets, presence RPCs, and row-level access policies. It is safe to rerun after applying updates. Admins can manage their own chat profile and update visitor display names and profile photos only for visitor accounts that have a conversation.
4. Run [`chatbot-migration.sql`](./chatbot-migration.sql) to add a saved welcome message and automatic keyword-based replies to visitor direct chats. Admins can add, edit, enable, prioritize, and delete keyword/reply rules and pause or resume the bot from the Admin inbox. Bot messages are inserted by database triggers and cannot be sent by clients as bot messages.
5. Run [`chat-group-management-migration.sql`](./chat-group-management-migration.sql) to enable Admin-only room deletion and show each group member's online state to everyone in that room.
6. Create the admin account through the trusted Supabase Dashboard (not visitor sign-up) and verify its email. Enable email/password sign-ups for visitors. If email confirmation is enabled, configure the site URL and add the deployed `/chat.html` URL to Auth's allowed redirect URLs so confirmation links return to chat.
7. Copy the admin user's UUID from Supabase Auth and explicitly bind that account to the email allowlist using the final SQL example in `schema.sql`. Existing email-only rows no longer grant Admin access. Visitor accounts cannot gain access by registering an allowlisted email; RLS checks the bound user UUID and confirmed email.
8. Copy the project URL and the **anon/public** key into `supabase-config.js`. Never put a `service_role` or secret key in this file.
9. Deploy the site over HTTPS. Visitors can sign up and chat at `/chat.html`. Sign in at `/admin/` with the allowlisted admin account to read and reply to private conversations, create and delete group rooms, share room IDs as invite codes, manage members, and read/send room messages.

For an existing project, run [`admin-user-binding-migration.sql`](./admin-user-binding-migration.sql) in the Supabase SQL Editor. It disables email-only admin access. Bind each intended admin's verified Auth user UUID to the matching `portfolio_admins.email` row using the SQL example in `schema.sql`. Do not automatically bind users by matching email.

For an existing chat project, run or rerun [`chatbot-migration.sql`](./chatbot-migration.sql) after `chat-migration.sql` to enable the automatic greeting, replies, and Admin inbox controls. Starter keyword/reply rules are inserted if missing. Admins can customize rules from the Admin inbox; edit `__greeting__` for new-conversation greetings, `*` for the fallback, and use higher priority values to choose which matching rule wins. Automatic replies are enabled by default and can be paused or resumed by an Admin. The assistant responds in private visitor chats only; group chats and Admin replies are not auto-replied to.

Run [`chat-group-management-migration.sql`](./chat-group-management-migration.sql) after `chat-migration.sql` on existing projects. Group room deletion is restricted by RLS to allowlisted admins. In shared rooms, visitors and Admin can see each member's online/offline indicator; presence details are returned only to an Admin or a member of that room.

### Group chat and attachments

- Group rooms use `public.chat_groups`, `public.chat_group_members` (`member_id`), and `public.chat_group_messages`. The migration seeds General, Introductions, Projects, Questions, and Resources.
- Direct and group messages are persisted in Supabase (`chat_messages` and `chat_group_messages`). The migration also creates `chat_presence`; signed-in pages update their own presence through a database RPC, and online indicators expire after 90 seconds without a heartbeat. Apply the latest migration for these presence functions.
- Presence records are private: visitors can read only the Admin's online status or a shared group's online count through scoped RPCs. The Admin can inspect presence for users with chat conversations or group memberships; direct table reads are disabled.
- Signed-in clients join a room by calling `client.rpc('join_chat_group', { p_group_id: enteredUUID })`. The RPC validates that the room exists and adds only the authenticated user; clients can then load their memberships with `.from('chat_group_members').select('group_id, chat_groups(id,name)').eq('member_id', user.id)`. Room IDs are the invite codes; non-admins cannot list undiscovered rooms or read other members' memberships. Admins can create rooms directly in `chat_groups` with `{ name, created_by }`, inspect membership IDs, and remove memberships.
- Group messages use `public.chat_group_messages` with `id, group_id, sender_id, body, attachment_path, attachment_name, created_at`. Existing private messages remain in `public.chat_messages`; optional attachment columns let the admin inbox send and render private-chat attachments too.
- `chat-attachments` is a private Storage bucket limited to 10 MB per object and the supported image, PDF, text, CSV, Word, and Excel MIME types. Use paths of the form `<conversation-or-group UUID>/<authenticated sender UUID>/<random>-<sanitized filename>`. Access is limited by the corresponding visitor conversation, group membership, or the portfolio-admin override; use authenticated Storage downloads or signed URLs, never public URLs.
- The visitor client should show only joined rooms returned by the membership query above. It may join a room when the visitor enters a valid room UUID, then use the same private-bucket path convention for room uploads; RLS is the access boundary, not secrecy of the UUID alone.
- The migration also creates `public.chat_profiles` for signed-in chat display names and private profile-photo paths. Visitors can read names while signed in and can insert or update only their own profile; allowlisted Admins can manage their own profile and update visitor profiles only for accounts with a chat conversation. Only allowlisted Admins can upload or delete profile photos; visitor photos are limited to accounts with a conversation, and Admin photo paths are limited to the Admin's own Auth UUID. The table contains no email addresses. Rerun the chat migration after deploying profile changes.
- `chat-migration.sql` also creates the `get_chat_presence(uuid[])` and `touch_chat_presence(boolean)` RPCs and the private `chat-profile-images` bucket. If the Admin inbox says `get_chat_presence` is missing, run the latest chat migration in the Supabase SQL Editor, then reload the Admin page. Admin profile-photo uploads are restricted to visitors with an existing conversation; images are private and accessed through signed URLs.
- `chatbot-migration.sql` adds a saved greeting for new conversations and Admin-managed keyword/reply rules for visitor messages. Admins can edit `__greeting__` and `*`, add, enable, prioritize, or delete regular rules. Rules are matched as whole words or phrases. Replies are not AI-generated, and visitors cannot read or change the rules or create messages marked as bot responses.
- `chat-group-management-migration.sql` adds the Admin-only group deletion policy and a scoped group-presence RPC. Deleting a group from Admin permanently removes its messages and memberships; the Admin UI also removes its private attachment objects.

If sending a direct message returns an RLS violation for `chat_messages`, confirm that `schema.sql` and then the latest `chat-migration.sql` both completed successfully in the same Supabase project. The insert policy requires the signed-in user's ID to match both the message sender and the visitor who owns that conversation. Do not disable RLS to work around this error. After applying the migration, sign out and back in so the page uses a fresh session.

For an existing project that already ran `schema.sql`, run [`social-links-migration.sql`](./social-links-migration.sql) in the Supabase SQL Editor to enable social-link management. In Admin, add, edit, reorder, or delete profile links; the public pages read the saved list from Supabase.

For an existing project, run [`github-project-import-migration.sql`](./github-project-import-migration.sql) in the Supabase SQL Editor to enable the atomic GitHub repository import. In Admin, choose **Replace with GitHub repos** to replace all current projects with the account's public repositories. This permanently deletes the current project rows; the import requires a non-empty repository list and runs as one database transaction.

For an existing project, run [`resume-management-migration.sql`](./resume-management-migration.sql) in the Supabase SQL Editor to enable resume management. In Admin, upload a PDF (up to 10 MB) to replace the public resume or delete it; the Home and Contact resume links follow the saved file. The resume storage bucket is public so visitors can open the PDF, while upload and delete access is restricted to allowlisted admins.

For an existing project, run [`skills-tools-migration.sql`](./skills-tools-migration.sql) in the Supabase SQL Editor to enable separate Skills and Tools sections in Admin. Add, edit, reorder, and delete entries in either section; the public Skills page reads the saved catalog from Supabase.

The Supabase anon key is intended for browser use. Row Level Security is the authorization boundary; keep the admin allowlist table inaccessible to client roles.

## Social sharing metadata

The pages include Open Graph and Twitter metadata. Because the public domain is not configured, the social preview image currently uses a relative path. After deployment, set `og:image` and `twitter:image` to the absolute URL for `assets/images/social-preview.svg`, and add each page's canonical URL and `og:url` in its HTML.

## Contact form on Netlify

1. Deploy the site to Netlify and enable automatic form detection in the site's Forms settings.
2. Redeploy after enabling detection so Netlify can register the `portfolio-contact` form.
3. Add a form notification for `portfolio-contact` to the confirmed inbox, `manishpvt19@gmail.com`.

The form uses browser validation and a honeypot. Local `file://` previews cannot submit to Netlify.
