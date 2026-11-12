-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 006_seed_roles.sql
--
-- The local dev stack ships one pre-seeded moderator account
-- (`mod@nagar.local`). The role lives on `profiles`, not on the auth user,
-- so the assignment is made here.
--
-- Production is different: there is no seed file with a hard-coded account.
-- A moderator is granted the role by another moderator through the admin
-- console (unit 007), and every such grant is recorded in
-- `moderation_actions`.
-- -----------------------------------------------------------------------------

update public.profiles
set role = 'moderator'
where email = 'mod@nagar.local'
  and role <> 'moderator';
