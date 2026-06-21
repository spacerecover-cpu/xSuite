-- =============================================================================
-- OPERATOR-APPLY MIGRATION: signup_otps_consumed_at
-- =============================================================================
-- DO NOT auto-apply. The subagent that authored this is barred from applying
-- migrations / regenerating types. Operator lands via:
--   mcp__supabase__apply_migration(project_id='ssmbegiyjivrcwgcqutu',
--     name='signup_otps_consumed_at', query=<body>)
-- then `npm run db:types`, add a migrations.manifest row, check-schema-drift +
-- check-tsc.
--
-- WHY: provision-tenant re-verifies the signup OTP server-side before creating
-- the auth user. Today it re-checks the latest verified+unexpired signup_otps
-- row. To make that row SINGLE-USE (so a verified code can't provision twice),
-- it needs a consumed_at column to stamp on use. Verified live 2026-06-15:
-- signup_otps has columns {id, email, otp_code, verified, attempts, expires_at,
-- created_at} — no consumed_at.
--
-- AFTER THIS LANDS: update provision-tenant/index.ts to also filter
--   .is('consumed_at', null)
-- on the OTP re-check and stamp consumed_at = now() on the matched row (the code
-- has a TODO marker at the OTP re-verify block).
-- =============================================================================

ALTER TABLE public.signup_otps
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
