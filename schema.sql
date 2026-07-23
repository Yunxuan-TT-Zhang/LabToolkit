-- LabToolkit — Supabase schema for optional, end-to-end-encrypted account sync.
-- Run this once in the Supabase SQL editor. See SETUP.md.
--
-- Every content column holds CIPHERTEXT produced in the browser by e2e.js. The server
-- cannot read it. Row-Level Security additionally guarantees each user only ever sees
-- their own rows.

-- ---------------------------------------------------------------------------
-- Per-account crypto envelope: the wrapped data keys (never the keys themselves).
-- ---------------------------------------------------------------------------
create table if not exists public.account_keys (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  envelope    jsonb not null,           -- { v, passSalt, recSalt, wrappedByPass, wrappedByRecovery }
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Saved items: recipes and protocols. `payload` is an encrypted blob { v, iv, ct }.
-- `kind` and timestamps are the only plaintext, so nothing about the content leaks.
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('recipe', 'protocol', 'document')),
  payload     jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);
create index if not exists items_user_idx on public.items (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user may only read/write rows they own.
-- ---------------------------------------------------------------------------
alter table public.account_keys enable row level security;
alter table public.items        enable row level security;

drop policy if exists account_keys_owner on public.account_keys;
create policy account_keys_owner on public.account_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists items_owner on public.items;
create policy items_owner on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Encrypted file storage (uploaded PDFs / images for the protocol library).
-- The bucket is private; objects are encrypted before upload. Access is scoped so the
-- first path segment must be the owner's user id, e.g. "<uid>/<item-id>".
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists documents_owner on storage.objects;
create policy documents_owner on storage.objects
  for all
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
