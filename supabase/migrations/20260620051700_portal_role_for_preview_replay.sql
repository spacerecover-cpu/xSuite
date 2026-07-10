-- Preview-replay shim #2 (preview-fix workstream; precedent: 20260409000001).
--
-- The portal customer JWT role was created on the live DB by the UNMIRRORED
-- portal_role_and_customer_scoped_read_policies migration (20260601074108).
-- Mirrored files 20260620051740 / 20260620053512 GRANT to it and create
-- policies for it, so a fresh preview-branch replay dies with
-- 'role "portal" does not exist'.
--
-- Recreates the role with the live shape (NOLOGIN, INHERIT, no BYPASSRLS,
-- member of authenticator so PostgREST can switch into it). Idempotent;
-- registered as applied on prod (role already exists there).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal') THEN
    CREATE ROLE portal NOLOGIN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_auth_members am
    JOIN pg_roles r ON r.oid = am.roleid
    JOIN pg_roles m ON m.oid = am.member
    WHERE r.rolname = 'portal' AND m.rolname = 'authenticator'
  ) THEN
    GRANT portal TO authenticator;
  END IF;
END
$$;
