# Demo Visitor Chat Access

## Demo account

The following requested demo visitor IDs are labels only; they are not provisioned Supabase accounts or login credentials:

| Demo visitor ID | Name |

Visitor accounts are created in the Supabase project used by the deployed site. The chat currently signs in with an email address and password; these IDs alone cannot be used to log in. Associate each label with a registered account in your private tester records, and do not publish account emails or passwords here.

To create a demo login:

1. Open the deployed site's `/chat.html` page and choose **Create an account**.
2. Register a dedicated test email address and a unique password. The email address is the visitor login ID.
3. If email confirmation is enabled in Supabase Auth, confirm the address before signing in.
4. Sign in with that email and password. This visitor account can use chat, but it does not grant access to `/admin/`.

## Sharing credentials safely

Do not add a real visitor password, Supabase secret, or service-role key to this repository or a public README. Create a separate demo account with no reused password, and share its credentials only through a private channel with intended testers. Revoke or rotate the account when the demo ends.

For a public demo, leave account creation enabled and let each visitor create their own account. Supabase Auth and the database policies enforce account and chat access; a README does not create or authorize an account.
