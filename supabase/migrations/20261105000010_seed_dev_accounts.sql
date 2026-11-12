-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 20261105000010_seed_dev_accounts.sql
--
-- The local dev accounts.
--
-- `supabase db reset` wipes `auth.users`. Without a seeded account the dev
-- stack has nobody to sign in as: the moderator console is unreachable, the
-- admin flow cannot be exercised, and a fresh clone cannot log in at all.
--
-- The accounts are created HERE rather than in `supabase/seed.sql` because the
-- password hash is a **bcrypt** digest produced by GoTrue, and reproducing it
-- in SQL would mean re-implementing GoTrue's hashing. The seed file cannot
-- insert into `auth.users` with a valid credential.
--
-- These accounts are LOCAL-ONLY by construction:
--   * the e-mail domain `.local` is reserved and never resolvable
--   * the passwords are in this file, in the repo, for local use only
--   * a production project has no migration that creates them
--
-- The `id` values are FIXED so that a reset produces the same uuids every
-- time — the SQL test suites and the mobile fixtures depend on them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The three dev accounts.
--
-- `citizen@nagar.local` — an ordinary citizen.
-- `mod@nagar.local`     — a moderator. The role lives on `profiles`, and the
--                          `handle_new_user` trigger copies it out of the auth
--                          metadata, so the role is never a signup field.
--
-- The password for all three is `nagar-local-dev`.
-- -----------------------------------------------------------------------------

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  is_sso_user,
  is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-1111111111a1',
    'authenticated',
    'authenticated',
    'citizen@nagar.local',
    crypt('nagar-local-dev', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"phone":"+8801711000001","full_name":"Local Citizen"}',
    now(),
    now(),
    '',
    '',
    '',
    '',
    null,
    null,
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-1111111111a2',
    'authenticated',
    'authenticated',
    'mod@nagar.local',
    crypt('nagar-local-dev', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"phone":"+8801911000002","full_name":"Local Moderator","role":"moderator"}',
    now(),
    now(),
    '',
    '',
    '',
    '',
    null,
    null,
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-1111111111a3',
    'authenticated',
    'authenticated',
    'citizen2@nagar.local',
    crypt('nagar-local-dev', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"phone":"+8801711000003","full_name":"Second Citizen"}',
    now(),
    now(),
    '',
    '',
    '',
    '',
    null,
    null,
    false,
    false
  )
on conflict (id) do nothing;

-- The `handle_new_user` trigger creates the `profiles` row for each new auth
-- user, but a row that already exists is left alone — so the profile is
-- written explicitly here to make the seed self-contained.
--
-- `auth.users.encrypted_password` uses the bcrypt variant GoTrue expects, so
-- the seeded accounts can sign in through the normal password path.

insert into public.profiles (id, email, phone, full_name, role)
values
  ('11111111-1111-1111-1111-1111111111a1', 'citizen@nagar.local', '+8801911000001', 'Local Citizen', 'citizen'),
  ('11111111-1111-1111-1111-1111111111a2', 'mod@nagar.local', '+8801911000002', 'Local Moderator', 'moderator'),
  ('11111111-1111-1111-1111-1111111111a3', 'citizen2@nagar.local', '+8801911000003', 'Second Citizen', 'citizen')
on conflict (id) do update set
  email = excluded.email,
  phone = excluded.phone,
  full_name = excluded.full_name,
  role = excluded.role;
