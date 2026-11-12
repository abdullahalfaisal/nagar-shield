-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 20261105000011_secure_server_side_write.sql
--
-- SECURITY FIX — an arbitrary-SQL hole in the privileged write helper.
--
-- `public.server_side_write(statement text)` is SECURITY DEFINER and executes
-- the statement it is handed. It exists so the server-side write paths
-- (`flag_report`, `moderation_decide`, `update_category`,
-- `record_biometric_attempt`, `soft_delete_account`, `restore_account`) can
-- lift the client-facing column guards for the duration of one statement.
--
-- **The defect.** Postgres grants EXECUTE on a new function to `PUBLIC` by
-- default. The function was created without a REVOKE, so the **anon** key
-- could call it over PostgREST:
--
--   POST /rest/v1/rpc/server_side_write
--   {"statement": "insert into public.reports ..."}
--
-- Because the function is SECURITY DEFINER, that statement ran as the table
-- OWNER — bypassing every RLS policy in the database. An unauthenticated
-- caller could read `profiles`, write `reports`, rewrite `moderation_actions`
-- (the append-only trigger would still fire, but everything else was open),
-- and forge audit rows as any moderator.
--
-- **The fix.** EXECUTE is revoked from `PUBLIC`, `anon`, and `authenticated`,
-- and granted only to `service_role` (plus the owner, who keeps it by
-- default). The `SECURITY DEFINER` functions that call it run as the owner,
-- so their internal calls are unaffected — the revoke changes who may call
-- the helper *directly*, not who may use the business rules built on it.
--
-- **The general rule this establishes.** A SECURITY DEFINER function that
-- executes caller-supplied SQL, or that performs a privileged write, must
-- have its EXECUTE grant stated explicitly. The default grant to PUBLIC is
-- never acceptable for a `SECURITY DEFINER` function.
--
-- The regression guard lives in `supabase/tests/schema_contract.sql`
-- (Contract 5a) and in `tools/probe-server-side-write.cjs`.
-- =============================================================================

revoke execute on function public.server_side_write(text) from public;
revoke execute on function public.server_side_write(text) from anon;
revoke execute on function public.server_side_write(text) from authenticated;

grant execute on function public.server_side_write(text) to service_role;

comment on function public.server_side_write(text) is
  'Runs a write statement with the client-facing column guards lifted. SECURITY DEFINER: EXECUTE is restricted to service_role and the owner — it must never be reachable by a client key.';

-- -----------------------------------------------------------------------------
-- The other SECURITY DEFINER functions are privileged *business rules*, not
-- arbitrary-SQL helpers, but the same default-grant concern applies to the
-- ones that only make sense for the service role. Their grants are restated
-- explicitly so a future migration cannot widen them by accident.
-- -----------------------------------------------------------------------------

-- `disable_user` and `moderation_decide` are the Edge Function write paths.
-- The RPC versions stay available to `authenticated` because the function
-- itself performs the moderator role check — that check is inside the
-- function, so the grant does not widen what a citizen can do.
grant execute on function public.disable_user(uuid, text) to authenticated;
grant execute on function public.moderation_decide(uuid, text, text) to authenticated;

-- The account lifecycle helpers are the signed-in user's own account.
grant execute on function public.soft_delete_account() to authenticated;
grant execute on function public.restore_account() to authenticated;
