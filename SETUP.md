# TheLabToolkit — accounts & sync setup

TheLabToolkit works fully **without** any of this: the calculators run in the browser and
saved recipes/protocols live in `localStorage`. Accounts add **optional** cross-device sync.
This document is how you turn that on.

Until `config.js` has real values, the app stays in local-only mode and says so on the
**About & privacy** page.

## Architecture at a glance

- **Frontend** — the existing static site (no build step). Hosted on GitHub Pages (or
  Cloudflare Pages) at `thelabtoolkit.com`.
- **Backend** — [Supabase](https://supabase.com): Postgres + Auth + Storage, guarded by
  Row-Level Security so a user can only touch their own rows.

## Privacy model (read before launch)

Synced items are stored in the `items` table as their JSON payload, protected by:

- **Row-Level Security** — a user can only read/write their own rows.
- **Encryption at rest** — Supabase encrypts the database on disk.

This is **not** end-to-end encryption. The operator (you), via the Supabase dashboard or the
`service_role` key, can in principle read stored rows. This model was chosen deliberately so
a standard **"forgot password" email reset can restore a user's data** — which is only
possible if the server can recover it. End-to-end encryption and a data-restoring password
reset are mutually exclusive.

The UI states this honestly (Account page + About & privacy): users are told synced data is
"private to your account but not end-to-end encrypted", and advised to keep anything that
must be provably private local-only (don't sign in) or exported. The sync-reconciliation
logic is validated by `npm run test:sync`.

## One-time Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
   Do **not** copy the `service_role` key — it must never go in the frontend.
3. Paste them into `config.js`:
   ```js
   window.LABTOOLKIT_CONFIG = {
     supabaseUrl: 'https://YOURPROJECT.supabase.co',
     supabaseAnonKey: 'eyJ...the anon public key...',
   };
   ```
4. In the Supabase **SQL editor**, run `schema.sql` from this repo. It creates the tables,
   enables Row-Level Security, and adds the per-user policies.
5. In **Authentication → Providers**, enable Email (and any OAuth providers you want).
6. Redeploy the site.

That's it — the account UI activates automatically once the config is present.

## Accounts & password reset

- Sign in with **email/password** or **Google** (OAuth, PKCE).
- **Forgot password** sends a Supabase reset email; the link returns the user to the app in a
  "set a new password" state. This restores access to their synced data — possible precisely
  because sync is not end-to-end encrypted.
- Supabase's **email confirmation** is on by default, so email sign-ups get a "check your
  email" step. Turn it off in Auth settings for instant sign-up if you prefer (Google skips it).

## GDPR

- **Export** — the Account page (and About & privacy) downloads all saved items as JSON.
- **Delete** — "Delete account data" removes every row synced to the user's account from the
  server and signs them out. Full auth-user record deletion needs an admin call (service_role
  or an edge function); wire that in if you need the auth record itself removed.

## What's built vs. pending

- **Built & tested now:** email + Google sign-in, forgot-password reset, cross-device sync
  (`npm run test:sync`), tool customization, honest messaging, local + account export/delete.
- **Pending:** the uploaded-document (PDF/image) protocol library, which reuses the private
  `documents` storage bucket (confirm the bucket exists first).
