# Document Studio — Phase 10 (Stage-Driven Automation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When a case changes phase, **advisorily auto-draft** the document that phase usually needs — so an engineer finds a near-complete draft waiting instead of creating one by hand. Advisory only: never auto-approve, auto-send, or block the case transition.

**Architecture:** A new `src/lib/automation/documentAutomation.ts` exposes `onCaseTransitioned(caseId, fromPhase, toPhase, transition)`. It is fired **fire-and-forget** from the existing `updateCaseStatusMutation.onSuccess` in `useCaseMutations.ts` (after cache invalidation; `.catch(log)` so it can never block or break the case transition). Each rule is **idempotent** (skips if a draft of that subtype already exists for the case) and **failure-isolated** (one rule failing never affects another or the case). Drafts are created via the existing `createReportInstance` (Phase 8). Code-only — no migration, no schema change.

**Tech Stack:** TypeScript, Supabase (read for idempotency), TanStack Query (the mutation hook), Vitest. No new npm packages.

## Global Constraints

- **Advisory + non-blocking:** the automation only CREATES drafts. It NEVER auto-approves, sends, deletes, or transitions. The `onCaseTransitioned` call is fire-and-forget from `onSuccess` with `.catch()` — it must never throw into, await within, or otherwise affect the case-status mutation. Errors are `logger.error` only (NOT `toast`).
- **Idempotent:** before creating, check `listDocumentInstances(caseId)`; skip if a non-deleted instance with the target `report_subtype` already exists. Re-entering a phase must not create duplicates. Skip entirely when `transition.no_op` is true.
- **Failure-isolated:** wrap each rule independently so one rule's error doesn't prevent the others; the whole function never rejects in a way that surfaces to the UI.
- **Rules (this phase):**
  - **P2 — Evaluation report:** `fromPhase === 'diagnosis' && toPhase === 'quoting'` → draft `report` subtype `evaluation`.
  - **P3 — Service report:** `fromPhase === 'recovery' && toPhase === 'qa'` → draft `report` subtype `service`.
- **P1 (data-destruction certificate on `delivered`) is DEFERRED — domain-correctness.** A Certificate of Destruction is a specific, consented destructive-service document (operator + witness), NOT something every delivered case should generate. Blanket-drafting it on every `delivered` transition would create spurious forensic documents (a generic-CRM assumption CLAUDE.md forbids). Implement it later behind a real "this case involved data destruction" predicate. Leave a clearly-commented stub in the rule table so it's a one-liner to enable.
- **Flag:** automation should respect `isDocStudioEnabled()` (no auto-drafts when Document Studio is off) — guard at the top of `onCaseTransitioned`.
- **Types/quality:** `Database` from `database.types.ts`; `maybeSingle()` not `single()`; tokens n/a (no UI). Per-task gate: `npm run typecheck` = 0 + the task's vitest green. Commit locally only — DO NOT push. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

**Create:**
- `src/lib/automation/documentAutomation.ts` — `onCaseTransitioned` + the rule table. (+ `.test.ts`)

**Modify:**
- `src/components/cases/detail/useCaseMutations.ts` — fire `onCaseTransitioned` fire-and-forget in `updateCaseStatusMutation.onSuccess`.

---

## Task 1: `documentAutomation` service (P2 + P3 rules)

**Files:**
- Create: `src/lib/automation/documentAutomation.ts`
- Test: `src/lib/automation/documentAutomation.test.ts`

**Interfaces:**
- Consumes: `createReportInstance`, `listDocumentInstances` (`documentInstanceService`); `isDocStudioEnabled` (`featureFlags`); `CasePhase` (`caseStateMachineService`); `logger`.
- Produces:
  ```ts
  export interface CaseTransition { ok?: boolean; from_phase?: string; to_phase?: string; no_op?: boolean; [k: string]: unknown }
  export async function onCaseTransitioned(
    caseId: string, fromPhase: string, toPhase: string, transition?: CaseTransition,
  ): Promise<void>;
  ```
  Never rejects to the caller in a way that matters (internal try/catch per rule + an outer guard); fire-and-forget safe.

Design: a `RULES` array of `{ id, when(from,to), reportSubtype, title }`. `onCaseTransitioned`: return early if `!isDocStudioEnabled()` or `transition?.no_op`; fetch `existing = await listInstances(caseId)` ONCE; for each matching rule, if no existing non-deleted instance has that `report_subtype`, `await createReportInstance(...)` inside a per-rule try/catch (`logger.error` on failure, continue).

- [ ] **Step 1: Write the failing test**

Create `src/lib/automation/documentAutomation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ createReportInstance: vi.fn(), listDocumentInstances: vi.fn() }));
vi.mock('../documentInstanceService', () => svc);
vi.mock('../logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../featureFlags', () => ({ isDocStudioEnabled: () => true }));

import { onCaseTransitioned } from './documentAutomation';

beforeEach(() => {
  vi.clearAllMocks();
  svc.listDocumentInstances.mockResolvedValue([]);
  svc.createReportInstance.mockResolvedValue({ id: 'di-new' });
});

describe('onCaseTransitioned', () => {
  it('P2: diagnosis -> quoting drafts an evaluation report', async () => {
    await onCaseTransitioned('c1', 'diagnosis', 'quoting');
    expect(svc.createReportInstance).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'c1', reportSubtype: 'evaluation' }));
  });

  it('P3: recovery -> qa drafts a service report', async () => {
    await onCaseTransitioned('c1', 'recovery', 'qa');
    expect(svc.createReportInstance).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'c1', reportSubtype: 'service' }));
  });

  it('does NOT draft a destruction certificate on delivered (P1 deferred)', async () => {
    await onCaseTransitioned('c1', 'ready', 'delivered');
    expect(svc.createReportInstance).not.toHaveBeenCalled();
  });

  it('is idempotent: skips when an evaluation draft already exists', async () => {
    svc.listDocumentInstances.mockResolvedValue([{ id: 'x', report_subtype: 'evaluation', deleted_at: null }]);
    await onCaseTransitioned('c1', 'diagnosis', 'quoting');
    expect(svc.createReportInstance).not.toHaveBeenCalled();
  });

  it('skips no_op transitions', async () => {
    await onCaseTransitioned('c1', 'quoting', 'quoting', { no_op: true });
    expect(svc.listDocumentInstances).not.toHaveBeenCalled();
    expect(svc.createReportInstance).not.toHaveBeenCalled();
  });

  it('does nothing for an unmatched transition', async () => {
    await onCaseTransitioned('c1', 'intake', 'diagnosis');
    expect(svc.createReportInstance).not.toHaveBeenCalled();
  });

  it('is failure-isolated: a createReportInstance rejection does not throw', async () => {
    svc.createReportInstance.mockRejectedValue(new Error('boom'));
    await expect(onCaseTransitioned('c1', 'diagnosis', 'quoting')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/automation/documentAutomation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/lib/automation/documentAutomation.ts`:

```ts
/**
 * Stage-driven document automation (Document Studio Phase 10). When a case changes
 * phase, advisorily auto-draft the document that phase usually needs. ADVISORY ONLY:
 * never approve/send/transition; idempotent; failure-isolated; fire-and-forget.
 */
import { createReportInstance, listDocumentInstances } from '../documentInstanceService';
import { isDocStudioEnabled } from '../featureFlags';
import { logger } from '../logger';

export interface CaseTransition {
  ok?: boolean;
  from_phase?: string;
  to_phase?: string;
  no_op?: boolean;
  [k: string]: unknown;
}

interface AutoDraftRule {
  id: string;
  /** Fires when a case moves from `from` to `to`. */
  when: (fromPhase: string, toPhase: string) => boolean;
  reportSubtype: 'evaluation' | 'service';
  title: string;
}

const RULES: AutoDraftRule[] = [
  // P2 — after diagnosis, entering quoting: an evaluation report to quote from.
  { id: 'P2_evaluation', when: (f, t) => f === 'diagnosis' && t === 'quoting', reportSubtype: 'evaluation', title: 'Evaluation Report' },
  // P3 — after recovery, entering QA: a service report documenting the work.
  { id: 'P3_service', when: (f, t) => f === 'recovery' && t === 'qa', reportSubtype: 'service', title: 'Service Report' },
  // P1 (DEFERRED) — data-destruction certificate. A Certificate of Destruction is a
  // CONSENTED destructive-service document (operator + witness), NOT something every
  // delivered case should auto-draft. Enable only behind a real "this case involved
  // data destruction" predicate, e.g.:
  //   { id: 'P1_destruction', when: (_f, t) => t === 'delivered' && caseHadDestruction, reportSubtype: 'data_destruction', title: 'Certificate of Destruction' },
];

/**
 * Fire-and-forget from the case-status mutation's onSuccess. Never throws to the
 * caller; each rule is isolated. Skips when Doc Studio is off or the transition is a no-op.
 */
export async function onCaseTransitioned(
  caseId: string,
  fromPhase: string,
  toPhase: string,
  transition?: CaseTransition,
): Promise<void> {
  try {
    if (!isDocStudioEnabled() || !caseId || transition?.no_op) return;
    const matching = RULES.filter((r) => r.when(fromPhase, toPhase));
    if (matching.length === 0) return;

    const existing = await listDocumentInstances(caseId);
    const existingSubtypes = new Set(
      existing.filter((d) => !d.deleted_at).map((d) => d.report_subtype),
    );

    for (const rule of matching) {
      if (existingSubtypes.has(rule.reportSubtype)) continue; // idempotent
      try {
        await createReportInstance({ caseId, reportSubtype: rule.reportSubtype, title: rule.title });
        logger.info?.(`[documentAutomation] drafted ${rule.reportSubtype} for case ${caseId} (${rule.id})`);
      } catch (err) {
        logger.error(`[documentAutomation] rule ${rule.id} failed for case ${caseId}:`, err);
      }
    }
  } catch (err) {
    logger.error('[documentAutomation] onCaseTransitioned failed:', err);
  }
}
```

> Note: `logger.info?.()` guards against the logger lacking `info`; match the real logger API (it has error/warn/info/debug per other services). `report_subtype` is the `document_instances` Row column (string|null).

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/automation/documentAutomation.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → 0.
```bash
git add src/lib/automation/documentAutomation.ts src/lib/automation/documentAutomation.test.ts
git commit -m "feat(documents): stage-driven auto-draft (P2 evaluation, P3 service) — advisory + idempotent (Phase 10)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Fire the hook from the case-status mutation

**Files:**
- Modify: `src/components/cases/detail/useCaseMutations.ts`

**Interfaces:**
- Consumes: `onCaseTransitioned` (Task 1). The `updateCaseStatusMutation.onSuccess` receives the RPC's return (`data`) which carries `from_phase`/`to_phase`/`no_op`.

- [ ] **Step 1: Wire fire-and-forget into onSuccess**

In `src/components/cases/detail/useCaseMutations.ts`, import `onCaseTransitioned` and change the mutation's `onSuccess` from `() => {}` to `(data) => {}`, adding AFTER the existing `queryClient.invalidateQueries(...)` calls:

```ts
import { onCaseTransitioned } from '../../../lib/automation/documentAutomation';
// ...
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ['case', id] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['cases_stats'] });
    queryClient.invalidateQueries({ queryKey: ['case_history', id] });

    // Advisory, fire-and-forget auto-draft (MUST NOT block/throw/break the mutation).
    const t = data as { from_phase?: string; to_phase?: string; no_op?: boolean } | null;
    if (id && t?.from_phase && t?.to_phase) {
      void onCaseTransitioned(id, t.from_phase, t.to_phase, t)
        .catch((err) => logger.error('[documentAutomation] onCaseTransitioned failed (non-blocking):', err));
    }
  },
```

> Note: confirm `logger` is already imported in this file (it is — used in the mutation's error paths). `onCaseTransitioned` already swallows its own errors; the extra `.catch` is belt-and-suspenders. Do NOT `await` it. Keep the rest of `onSuccess` and the other mutations unchanged.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → 0.

- [ ] **Step 3: Manual smoke (flag on)**

`VITE_DOC_STUDIO=true npm run dev`: move a case diagnosis→quoting → a draft Evaluation Report appears in the Documents tab; recovery→qa → a draft Service Report appears; re-doing the transition does NOT create a second draft; a delivered transition creates NO destruction cert; the case-status change itself always succeeds even if drafting fails.

- [ ] **Step 4: Commit**

```bash
git add src/components/cases/detail/useCaseMutations.ts
git commit -m "feat(documents): fire stage-driven auto-draft from case-status transition (Phase 10)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (before local merge)

- [ ] `npm run typecheck` → 0.
- [ ] `npx vitest run` → green except the known Typst WASM flake (isolated pass).
- [ ] Flag-off: with `VITE_DOC_STUDIO` unset, `onCaseTransitioned` no-ops (guarded) → no auto-drafts; case transitions unchanged.
- [ ] Manual (flag on): P2 + P3 auto-draft once each; idempotent on repeat; no destruction cert on delivered; a forced drafting failure never blocks the case transition.

## Scope notes
- **In scope:** the automation framework + P2 (evaluation) + P3 (service), idempotent/advisory/failure-isolated/fire-and-forget, flag-gated.
- **Deferred (domain-correctness):** P1 destruction-certificate automation — needs a real "case involved data destruction" predicate so it doesn't generate spurious certificates; the `RULES` table has a commented stub to enable it in one line.
- **No migration / no schema change.**
