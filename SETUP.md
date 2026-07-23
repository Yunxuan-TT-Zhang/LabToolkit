# LabToolkit — accounts & sync setup

LabToolkit works fully **without** any of this: the calculators run in the browser and
saved recipes/protocols live in `localStorage`. Accounts add **optional, end-to-end
encrypted** cross-device sync. This document is how you turn that on.

Until `config.js` has real values, the app stays in local-only mode and says so on the
**About & privacy** page.

## Architecture at a glance

- **Frontend** — the existing static site (no build step). Hosted on Cloudflare Pages (or
  GitHub Pages) at `thelabtoolkit.com`.
- **Backend** — [Supabase](https://supabase.com): Postgres + Auth + Storage, guarded by
  Row-Level Security so a user can only touch their own rows.
- **Privacy** — every recipe, protocol and uploaded file is encrypted **in the browser**
  (`e2e.js`, WebCrypto AES-GCM) before upload. The server stores ciphertext only. Neither
  Supabase nor you can read user content. See "The privacy model" below.

## The privacy model (read before launch)

Each account has a random 256-bit **data key** that encrypts its content. That data key is
stored **only** in wrapped (encrypted) form:

- wrapped by a key derived from the user's **passphrase** (PBKDF2-SHA256, 210k iterations),
- wrapped again by a random **recovery key** shown once at signup.

Consequences, by design:

- The server never sees the passphrase, the recovery key, or the data key in the clear.
- **If a user forgets both their passphrase and recovery key, their data is unrecoverable.**
  There is no reset that restores content — that is the price of you not being able to read
  it. The signup flow must make the user save the recovery key.
- A password *change* re-wraps the data key; it does not (and cannot) re-encrypt on the
  server, because the server can't read it.

This is validated by `npm run test:crypto`.

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

## GDPR

- **Export** — the About & privacy page downloads everything (decrypted locally) as JSON.
- **Delete** — deletes the user's rows, their storage objects, and their auth record. Because
  content is encrypted with a key only they hold, deleting the wrapped data key alone already
  renders every remaining blob permanently unreadable.

## What's built vs. pending

- **Built & tested now:** the encryption core (`e2e.js` + `npm run test:crypto`), local-only
  mode, tool customization, honest messaging, and local export/delete.
- **Pending (needs your live Supabase project to build against):** the sign-in/sign-up UI,
  the sync engine, server-side GDPR delete, and the uploaded-document protocol library.
  These are deliberately not shipped untested.
