# Portfolio services setup

## Supabase admin portal

1. Create a Supabase project.
2. Run [`schema.sql`](./schema.sql) in the Supabase SQL Editor. It creates the public project/settings/social-link tables, RLS policies, starter links, and a public image bucket. Public visitors can read content; only allowlisted admins can write.
3. Run [`chat-migration.sql`](./chat-migration.sql) in the Supabase SQL Editor to enable private visitor chats, five starter group rooms, group membership/message tables, the private attachment bucket, and row-level access policies. It is safe to rerun after applying updates.
4. In Supabase Auth, create the admin account with your chosen email and password. Enable email/password sign-ups for visitors. If email confirmation is enabled, configure the site URL and add the deployed `/chat.html` URL to Auth's allowed redirect URLs so confirmation links return to chat.
5. Add only the admin account's email to `public.portfolio_admins` using the final SQL statement in `schema.sql`. Visitor accounts do not receive admin access; the admin allowlist and database policies enforce this.
6. Copy the project URL and the **anon/public** key into `supabase-config.js`. Never put a `service_role` or secret key in this file.
7. Deploy the site over HTTPS. Visitors can sign up and chat at `/chat.html`. Sign in at `/admin/` with the allowlisted admin account to read and reply to private conversations, create group rooms, share room IDs as invite codes, manage members, and read/send room messages.

### Group chat and attachments

- Group rooms use `public.chat_groups`, `public.chat_group_members` (`member_id`), and `public.chat_group_messages`. The migration seeds General, Introductions, Projects, Questions, and Resources.
- Signed-in clients join a room by calling `client.rpc('join_chat_group', { p_group_id: enteredUUID })`. The RPC validates that the room exists and adds only the authenticated user; clients can then load their memberships with `.from('chat_group_members').select('group_id, chat_groups(id,name)').eq('member_id', user.id)`. Room IDs are the invite codes; non-admins cannot list undiscovered rooms or read other members' memberships. Admins can create rooms directly in `chat_groups` with `{ name, created_by }`, inspect membership IDs, and remove memberships.
- Group messages use `public.chat_group_messages` with `id, group_id, sender_id, body, attachment_path, attachment_name, created_at`. Existing private messages remain in `public.chat_messages`; optional attachment columns let the admin inbox send and render private-chat attachments too.
- `chat-attachments` is a private Storage bucket limited to 10 MB per object and the supported image, PDF, text, CSV, Word, and Excel MIME types. Use paths of the form `<conversation-or-group UUID>/<authenticated sender UUID>/<random>-<sanitized filename>`. Access is limited by the corresponding visitor conversation, group membership, or the portfolio-admin override; use authenticated Storage downloads or signed URLs, never public URLs.
- The visitor client should show only joined rooms returned by the membership query above. It may join a room when the visitor enters a valid room UUID, then use the same private-bucket path convention for room uploads; RLS is the access boundary, not secrecy of the UUID alone.
- The migration also creates `public.chat_profiles` for visitor display names. Visitors can read names while signed in and can insert or update only their own profile; the table contains no email addresses. Rerun the chat migration after deploying the display-name UI.

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
