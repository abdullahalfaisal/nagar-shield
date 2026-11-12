-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/password_reset.sql
--
-- Exercises the server-side rules of the password-reset OTP:
--   * the code is compared against a bcrypt hash, and only a match releases
--     the GoTrue token
--   * the 10-minute validity window
--   * the 3-attempt limit
--   * the 30-minute cooldown, and that the cooldown refuses even a correct code
--   * the failures are RETURNED rather than RAISED, so the attempt counter
--     survives a rejection
--   * only the newest challenge is valid
--   * an unknown identifier produces no signal
--   * the table is server-only
--
-- The live probe (`tools/probe-password-reset.cjs`) covers the half this
-- suite cannot: the Edge Function's own request/response behaviour, the mail
-- delivery, and the GoTrue session. This suite covers the half the probe
-- cannot: the rules *inside* the database.
--
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/password_reset.sql
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values (
  '44444444-4444-4444-4444-444444444401',
  'reset-a@test.local',
  json_build_object('phone', '+8801711000401')
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '44444444-4444-4444-4444-444444444402',
  'reset-b@test.local',
  json_build_object('phone', '+8801711000402')
);

-- The trigger creates the profile rows. The tests below need the ids, and a
-- psql variable cannot be an assignment target — so they live in a temp table.
create temporary table test_profiles (
  label text primary key,
  id uuid not null
) on commit drop;

insert into test_profiles (label, id)
select 'a', id from public.profiles where email = 'reset-a@test.local'
union all
select 'b', id from public.profiles where email = 'reset-b@test.local';

-- -----------------------------------------------------------------------------
-- Test 1 — the code hash is bcrypt, and the plaintext is never stored
-- -----------------------------------------------------------------------------

select 'Test 1a: the code hash is a bcrypt hash' as test,
       public.password_reset_code_hash('123456') like '$2%' as passed;

select 'Test 1b: two hashes of the same code differ (they are salted)' as test,
       public.password_reset_code_hash('123456') <> public.password_reset_code_hash('123456') as passed;

select 'Test 1c: the plaintext code is not in the hash' as test,
       public.password_reset_code_hash('123456') not like '%123456%' as passed;

-- The salted comparison, done the way the RPC does it: `crypt(code, hash)`
-- against the **stored** hash. A matching code reproduces the stored hash.
--
-- The hash is held in a temp table first, because
-- `password_reset_code_hash` generates a fresh salt on every call —
-- comparing two separate calls would compare two different hashes, which is
-- Test 1b, not Test 1d.
create temporary table test_hashes (
  label text primary key,
  hash text not null
) on commit drop;

insert into test_hashes (label, hash)
values ('123456', public.password_reset_code_hash('123456'));

select 'Test 1d: the hash verifies the code it was made from' as test,
       (extensions.crypt('123456', (select hash from test_hashes where label = '123456'))
        = (select hash from test_hashes where label = '123456')) as passed;

select 'Test 1e: the hash rejects a different code' as test,
       (extensions.crypt('000000', (select hash from test_hashes where label = '123456'))
        <> (select hash from test_hashes where label = '123456')) as passed;

-- -----------------------------------------------------------------------------
-- Test 2 — the constants
-- -----------------------------------------------------------------------------

select 'Test 2a: the validity window is 10 minutes' as test,
       public.password_reset_otp_ttl_minutes() = 10 as passed;

select 'Test 2b: the attempt limit is 3' as test,
       public.password_reset_otp_max_attempts() = 3 as passed;

select 'Test 2c: the cooldown is 30 minutes' as test,
       public.password_reset_otp_cooldown_minutes() = 30 as passed;

-- -----------------------------------------------------------------------------
-- Test 3 — the challenge is recorded, and only one may be live
-- -----------------------------------------------------------------------------

-- The unknown identifier raises, so the assertion is made with an exception
-- block. The message is captured rather than swallowed, so the assertion
-- below can check it.
create temporary table test_refusals (
  label text primary key,
  message text not null
) on commit drop;

do $$
begin
  begin
    perform public.start_password_reset_otp(
      'nobody@test.local', 'nobody@test.local',
      public.password_reset_code_hash('123456'), 'deadbeef'
    );
    insert into test_refusals (label, message)
    values ('unknown_identifier', 'NO REFUSAL');
  exception when others then
    insert into test_refusals (label, message)
    values ('unknown_identifier', sqlerrm);
  end;
end
$$;

select 'Test 3a: starting a challenge for an unknown identifier is refused' as test,
       (select message from test_refusals where label = 'unknown_identifier') <> 'NO REFUSAL' as passed;

select 'Test 3b: the refusal for an unknown identifier is AUTH_REQUIRED' as test,
       (select message from test_refusals where label = 'unknown_identifier') like '%AUTH_REQUIRED%' as passed;

-- A real challenge. The account email and the phone both resolve to it.
select 'Test 3c: a challenge is recorded for a known identifier' as test,
       (public.start_password_reset_otp(
          'reset-a@test.local', 'reset-a@test.local',
          public.password_reset_code_hash('123456'), 'token-abc'
        ) ->> 'ok') = 'true' as passed;

select 'Test 3d: the challenge expires in 10 minutes' as test,
       (public.start_password_reset_otp(
          'reset-a@test.local', 'reset-a@test.local',
          public.password_reset_code_hash('123456'), 'token-abc'
        ) ->> 'expires_in_sec')::int = 600 as passed;

select 'Test 3e: a phone identifier reaches the same account' as test,
       (public.start_password_reset_otp(
          '+8801711000401', 'reset-a@test.local',
          public.password_reset_code_hash('123456'), 'token-abc'
        ) ->> 'ok') = 'true' as passed;

-- Only the newest challenge is valid — the partial unique index is what makes
-- that structural rather than a rule the RPC has to remember.
select 'Test 3f: only one challenge is live per account' as test,
       (select count(*) from public.password_reset_challenges
         where user_id = (select id from test_profiles where label = 'a') and consumed_at is null) = 1 as passed;

select 'Test 3g: the superseded challenge is marked consumed' as test,
       (select count(*) from public.password_reset_challenges
         where user_id = (select id from test_profiles where label = 'a')
           and consumed_at is not null) >= 1 as passed;

-- -----------------------------------------------------------------------------
-- Test 4 — the code comparison
-- -----------------------------------------------------------------------------

-- A fresh challenge with a known code.
select public.start_password_reset_otp(
  'reset-a@test.local', 'reset-a@test.local',
  public.password_reset_code_hash('123456'), 'token-abc'
) is not null as "challenge started";

select 'Test 4a: the correct code is accepted' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '123456', true) ->> 'ok') = 'true' as passed;

select 'Test 4b: a correct code releases the GoTrue token' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '123456', true) ->> 'token_hash') = 'token-abc' as passed;

-- A wrong code is refused, and it does **not** release the token.
select 'Test 4c: a wrong code is refused' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '000000', true) ->> 'ok') = 'false' as passed;

select 'Test 4d: a wrong code does not release the GoTrue token' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '000000', true) ->> 'token_hash') is null as passed;

select 'Test 4e: the refusal reason is wrong_code' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '000000', true) ->> 'reason') = 'wrong_code' as passed;

select 'Test 4f: an empty code is refused' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '', true) ->> 'ok') = 'false' as passed;

-- The critical property: a wrong code must not have consumed the challenge.
-- The attempt counter is incremented by the *accounting* call, which is a
-- separate invocation with p_attempt_ok = false.
select 'Test 4g: a refused code leaves the attempt counter alone' as test,
       (select attempts from public.password_reset_challenges
         where user_id = (select id from test_profiles where label = 'a') and consumed_at is null) = 0 as passed;

-- -----------------------------------------------------------------------------
-- Test 5 — the attempt accounting survives the rejection
-- -----------------------------------------------------------------------------
--
-- This is the property the first implementation got wrong. The function is one
-- transaction, so a `raise exception` would roll the increment back and the
-- counter would stay at 0 forever. The failures are therefore RETURNED.

select public.check_password_reset_otp_state('reset-a@test.local', '000000', false) is not null as "accounted";

select 'Test 5a: a failed attempt is counted' as test,
       (select attempts from public.password_reset_challenges
         where user_id = (select id from test_profiles where label = 'a') and consumed_at is null) = 1 as passed;

select public.check_password_reset_otp_state('reset-a@test.local', '000000', false) is not null as "accounted";

select 'Test 5b: the second failed attempt is counted' as test,
       (select attempts from public.password_reset_challenges
         where user_id = (select id from test_profiles where label = 'a') and consumed_at is null) = 2 as passed;

-- The third failure opens the cooldown, and reports it.
select public.check_password_reset_otp_state('reset-a@test.local', '000000', false) ->> 'code' as "code";

select 'Test 5c: the third failure reports OTP_RATE_LIMIT' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '000000', false) ->> 'code') = 'OTP_RATE_LIMIT' as passed;

select 'Test 5d: the cooldown is opened' as test,
       (select cooldown_until is not null from public.password_reset_challenges
         where user_id = (select id from test_profiles where label = 'a') and consumed_at is null) as passed;

select 'Test 5e: the cooldown lasts 30 minutes' as test,
       abs(
         extract(epoch from (
           select cooldown_expires_at - cooldown_until
             from public.password_reset_challenges
            where user_id = (select id from test_profiles where label = 'a')
              and consumed_at is null
         )) / 60.0
         - 30.0
       ) < 0.5 as passed;

select 'Test 5f: the third failure carries the remaining wait' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '000000', false) ->> 'retry_after_sec')::int > 1700 as passed;

-- -----------------------------------------------------------------------------
-- Test 6 — the cooldown refuses even a CORRECT code
-- -----------------------------------------------------------------------------
--
-- This is AC #5's sharp edge. The refusal is server-side, so a client that
-- ignores its own countdown gains nothing.

select 'Test 6a: the correct code is refused while the cooldown runs' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '123456', true) ->> 'ok') = 'false' as passed;

select 'Test 6b: the refusal is OTP_RATE_LIMIT, not a wrong-code' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '123456', true) ->> 'code') = 'OTP_RATE_LIMIT' as passed;

select 'Test 6c: the cooldown refusal carries the remaining wait' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '123456', true) ->> 'retry_after_sec')::int > 1700 as passed;

select 'Test 6d: the cooldown refusal does not release the token' as test,
       (public.check_password_reset_otp_state('reset-a@test.local', '123456', true) ->> 'token_hash') is null as passed;

-- -----------------------------------------------------------------------------
-- Test 7 — the validity window
-- -----------------------------------------------------------------------------

-- A challenge that expired a minute ago.
select public.start_password_reset_otp(
  'reset-b@test.local', 'reset-b@test.local',
  public.password_reset_code_hash('123456'), 'token-def'
) is not null as "challenge started";

update public.password_reset_challenges
   set expires_at = now() - interval '1 minute'
 where user_id = (select id from test_profiles where label = 'b') and consumed_at is null;

select 'Test 7a: an expired challenge is refused' as test,
       (public.check_password_reset_otp_state('reset-b@test.local', '123456', true) ->> 'ok') = 'false' as passed;

select 'Test 7b: the refusal reason is expired' as test,
       (public.check_password_reset_otp_state('reset-b@test.local', '123456', true) ->> 'reason') = 'expired' as passed;

-- -----------------------------------------------------------------------------
-- Test 8 — the no-oracle rule, and the consumed challenge
-- -----------------------------------------------------------------------------

select 'Test 8a: an unknown identifier gets the same generic failure' as test,
       (public.check_password_reset_otp_state('nobody@test.local', '123456', true) ->> 'code') = 'VALIDATION_FAILED' as passed;

select 'Test 8b: the unknown identifier leaks no token and no email' as test,
       (public.check_password_reset_otp_state('nobody@test.local', '123456', true) ->> 'token_hash') is null
   and (public.check_password_reset_otp_state('nobody@test.local', '123456', true) ->> 'account_email') is null as passed;

-- A consumed challenge is no longer found.
select public.consume_password_reset_otp('reset-b@test.local') is not null as "consumed";

select 'Test 8c: a consumed challenge is refused' as test,
       (public.check_password_reset_otp_state('reset-b@test.local', '123456', true) ->> 'reason') = 'no_challenge' as passed;

-- -----------------------------------------------------------------------------
-- Test 9 — the table is server-only
-- -----------------------------------------------------------------------------

select 'Test 9a: the challenge table has RLS enabled' as test,
       (select relrowsecurity from pg_class where oid = 'public.password_reset_challenges'::regclass) as passed;

select 'Test 9b: the challenge table has no policy for a client' as test,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'password_reset_challenges') = 0 as passed;

select 'Test 9c: start_password_reset_otp is not executable by anon' as test,
       has_function_privilege('anon', 'public.start_password_reset_otp(text,text,text,text)', 'execute') = false as passed;

select 'Test 9d: check_password_reset_otp_state is not executable by anon' as test,
       has_function_privilege('anon', 'public.check_password_reset_otp_state(text,text,boolean)', 'execute') = false as passed;

select 'Test 9e: check_password_reset_otp_state is not executable by authenticated' as test,
       has_function_privilege('authenticated', 'public.check_password_reset_otp_state(text,text,boolean)', 'execute') = false as passed;

select 'Test 9f: consume_password_reset_otp is not executable by anon' as test,
       has_function_privilege('anon', 'public.consume_password_reset_otp(text)', 'execute') = false as passed;

select 'Test 9g: password_reset_code_hash is not executable by anon' as test,
       has_function_privilege('anon', 'public.password_reset_code_hash(text)', 'execute') = false as passed;

select 'Test 9h: the RPCs are executable by service_role' as test,
       has_function_privilege('service_role', 'public.check_password_reset_otp_state(text,text,boolean)', 'execute')
   and has_function_privilege('service_role', 'public.start_password_reset_otp(text,text,text,text)', 'execute') as passed;

-- -----------------------------------------------------------------------------
-- Test 10 — the code is never stored in plaintext
-- -----------------------------------------------------------------------------

select 'Test 10a: no challenge row holds a plaintext-looking code' as test,
       (select count(*) from public.password_reset_challenges
         where code_hash !~ '^\$2') = 0 as passed;

select 'Test 10b: the column is named code_hash, not code' as test,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'password_reset_challenges'
           and column_name = 'code') = 0 as passed;

rollback;
