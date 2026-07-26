-- ============================================================================
-- ✅ APPLIED 2026-07-26 via mcp__supabase__apply_migration as version
-- 20260726210926 (recorded in supabase/migrations.manifest.md). Kept as the
-- authored artifact; the live DB + manifest are the source of truth.
-- Backfill demoted 1 case (#30375) from 'full' to 'partial'.
-- name: reconcile_no_solution_recovery_outcome
-- date: 2026-07-26
--
-- Fixes the "No Solution — Future Follow-up" + "Full recovery" contradiction.
--
-- cases.recovery_outcome is rolled up from case_recovery_attempts
-- (caseQualityService.aggregateRecoveryOutcome): when every attempt succeeded
-- the case is stamped 'full'. Nothing reconciled that column when the case was
-- LATER parked as no-solution — setNoSolutionReason writes the reason and
-- transition_case_status moves the phase, but neither touches the outcome. The
-- case then claims it recovered everything while sitting on a phase that means
-- the opposite, and no_solution is a no-recovery surface for Rule 51 advance-GST
-- refund eligibility (advanceTerminals.canOfferRefundVoucher lists it alongside
-- recovery_outcome='unrecoverable'), so the stale 'full' is a real data defect,
-- not a display glitch.
--
-- RULE (product decision, 2026-07-26): in the no_solution phase, 'full' becomes
-- 'partial' — some data WAS recovered, and that fact must not be lost, but the
-- remaining scope has no method today so the case is not a full recovery.
-- Every other outcome ('partial', 'unrecoverable', 'declined') is left as-is,
-- and a case with no recorded outcome stays NULL — never fabricate evidence
-- where no attempt was logged.
--
-- Enforced by a BEFORE INSERT OR UPDATE trigger rather than in the client,
-- because there are several write paths into the phase (transition_case_status,
-- the manual set_case_status override, log_case_checkout) and the DB is the
-- source of truth. Mirrored on the read side by
-- caseQualityService.reconcileOutcomeForPhase (unit-tested) so the badge is
-- already truthful on rows written before this migration lands — keep the two
-- in step if the rule ever changes.
--
-- Safety: additive (one function + one trigger) plus a narrow, idempotent data
-- correction. No schema change, no table rewrite, no DROP of existing objects.
-- Re-running is a no-op once every no_solution case has been reconciled.
-- ============================================================================

-- ── 1. Reconciliation trigger function ──────────────────────────────────────
-- Fires alphabetically AFTER trg_guard_cases_status_changes ('g' < 'r'), so the
-- state machine validates the transition first and this only adjusts the
-- outcome column on a row the guard has already accepted.
CREATE OR REPLACE FUNCTION public.reconcile_no_solution_outcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only a 'full' claim is contradictory; everything else passes through
  -- untouched (including NULL — absence of evidence stays absence of evidence).
  IF NEW.recovery_outcome IS DISTINCT FROM 'full' OR NEW.status_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- is_active is deliberately NOT checked: a case parked on a since-retired
  -- no_solution status must still reconcile.
  IF EXISTS (
    SELECT 1 FROM master_case_statuses s
    WHERE s.id = NEW.status_id AND s.type = 'no_solution'
  ) THEN
    NEW.recovery_outcome := 'partial';
  END IF;

  RETURN NEW;
END;
$function$;

-- Internal trigger function — not callable over PostgREST (house rule, see
-- migration 20260525024225 revoke_execute_on_internal_trigger_functions).
REVOKE EXECUTE ON FUNCTION public.reconcile_no_solution_outcome() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_reconcile_no_solution_outcome ON cases;
CREATE TRIGGER trg_reconcile_no_solution_outcome
  BEFORE INSERT OR UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION reconcile_no_solution_outcome();

-- ── 2. Backfill existing contradictory rows ─────────────────────────────────
-- Touches recovery_outcome only, so trg_guard_cases_status_changes (which
-- raises only when status / status_id actually change) passes cleanly and no
-- bypass flag is needed. The new trigger above also fires here and computes the
-- same value, which is harmless.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE cases c
     SET recovery_outcome = 'partial'
   WHERE c.recovery_outcome = 'full'
     AND EXISTS (
       SELECT 1 FROM master_case_statuses s
       WHERE s.id = c.status_id AND s.type = 'no_solution'
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'reconcile_no_solution_outcome backfill: % case(s) demoted full -> partial', v_count;
END $$;

-- ── 3. Verification (run after applying) ────────────────────────────────────
-- Expect 0 rows: no case may sit in the no_solution phase claiming a full
-- recovery.
--   SELECT c.id, c.case_number, c.recovery_outcome, s.name AS status
--     FROM cases c
--     JOIN master_case_statuses s ON s.id = c.status_id
--    WHERE s.type = 'no_solution' AND c.recovery_outcome = 'full';
