# Case Check-In Proof of Receipt & Consent Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the lab's device check-in produce forensic evidence — a batch-scoped receipt naming who physically handed the devices over, signed digitally into `document_signatures`, with consent recorded as separable facts.

**Architecture:** The DEVICE CHECK-IN RECEIPT (`office_receipt` / `customer_copy`) already exists and renders correctly; its signature block is blank wet-ink captions. We add per-device intake state to `case_devices` (mirroring the existing checkout collector columns), two SECURITY DEFINER RPCs (`log_case_intake`, `staff_sign_off_document`), three surgical `receiptAdapter` changes that reuse already-built engine primitives (`CollectorBlock`, `SignatureBlockData`), and a staff-authenticated front-desk route. Custody evidence is **appended** as a new `INTAKE_RECEIPT_SIGNED` event — `chain_of_custody` is append-only and must never be updated in place.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query v5, Supabase (Postgres 15), vitest, pdfmake via the config-driven PDF engine.

**Spec:** `docs/superpowers/specs/2026-08-04-case-checkin-proof-of-receipt-design.md`

---

## File Structure

**Created:**
- `src/lib/caseIntakeService.ts` — case+device creation (extracted from the wizard) and the intake-evidence calls (`logCaseIntake`, `signIntakeReceipt`, `captureIntakeConsents`).
- `src/lib/caseIntakeService.test.ts`
- `src/pages/cases/CaseCheckIn.tsx` — the front-desk route shell + submit orchestration.
- `src/components/cases/checkin/DepositorSection.tsx` — relationship selector + depositor identity fields.
- `src/components/cases/checkin/DepositorSection.test.tsx`
- `src/components/cases/checkin/IntakeDeviceRows.tsx` — repeatable device capture rows.
- `src/components/cases/checkin/AcknowledgeSection.tsx` — the three consent checkboxes + signature trigger.
- `src/components/cases/checkin/AcknowledgeSection.test.tsx`

**Modified:**
- `src/lib/pdf/types.ts` — `DeviceData` gains the intake fields; `ReceiptData` gains `capturedSignatures`.
- `src/lib/pdf/engine/adapters/receiptAdapter.ts` — batch scoping, depositor block, captured signatures.
- `src/lib/pdf/engine/adapters/receiptAdapter.test.ts` (create if absent) — adapter TDD.
- `src/lib/pdf/dataFetcher.ts` — select the new columns, resolve captured signatures.
- `src/components/cases/CreateCaseWizard.tsx:349-497` — call the extracted service.
- `src/App.tsx` — register `/cases/check-in`.
- `src/types/database.types.ts` — regenerated (never hand-edited).

**Phasing:** Tasks 1-3 are DB. Tasks 4-7 are the document (pure TS, fully testable). Tasks 8-9 are services. Tasks 10-12 are UI. Each phase leaves the app working.

---

### Task 1: Migration — per-device intake state on `case_devices`

**Files:**
- Apply via `mcp__Supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`)
- Modify: `src/types/database.types.ts` (regenerated)

- [ ] **Step 1: Apply the migration**

Call `mcp__Supabase__apply_migration` with `project_id: "ssmbegiyjivrcwgcqutu"`, `name: "case_devices_intake_state"`, and this query:

```sql
ALTER TABLE public.case_devices
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS intake_batch_id uuid,
  ADD COLUMN IF NOT EXISTS depositor_name text,
  ADD COLUMN IF NOT EXISTS depositor_mobile text,
  ADD COLUMN IF NOT EXISTS depositor_id text,
  ADD COLUMN IF NOT EXISTS depositor_relationship text,
  ADD COLUMN IF NOT EXISTS received_by uuid;

ALTER TABLE public.case_devices
  DROP CONSTRAINT IF EXISTS case_devices_depositor_relationship_check;

ALTER TABLE public.case_devices
  ADD CONSTRAINT case_devices_depositor_relationship_check
  CHECK (
    depositor_relationship IS NULL
    OR depositor_relationship IN ('self', 'authorized_agent', 'company_rep', 'courier')
  );

CREATE INDEX IF NOT EXISTS idx_case_devices_intake_batch
  ON public.case_devices (case_id)
  WHERE received_at IS NOT NULL AND deleted_at IS NULL;

-- Best-effort backfill: historical devices should not read as "never received".
-- chain_of_custody has no occurred_at column; created_at is the event time.
UPDATE public.case_devices d
   SET received_at = c.created_at
  FROM (
    SELECT device_id, min(created_at) AS created_at
      FROM public.chain_of_custody
     WHERE action = 'DEVICE_RECEIVED'
       AND device_id IS NOT NULL
     GROUP BY device_id
  ) c
 WHERE d.id = c.device_id
   AND d.received_at IS NULL;
```

No RLS change: `case_devices` is already tenant-scoped with a RESTRICTIVE isolation policy, and additive columns inherit it.

- [ ] **Step 2: Regenerate types**

Run: `npm run db:types`
Expected: `src/types/database.types.ts` rewritten; `git diff --stat` shows only that file.

- [ ] **Step 3: Verify the columns exist and typecheck is clean**

Call `mcp__Supabase__execute_sql` with `project_id: "ssmbegiyjivrcwgcqutu"` and:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'case_devices'
   AND column_name IN ('received_at','intake_batch_id','depositor_name',
                       'depositor_mobile','depositor_id','depositor_relationship','received_by')
 ORDER BY column_name;
```

Expected: 7 rows.

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.types.ts
git commit -m "feat(db): add per-device intake state to case_devices"
```

---

### Task 2: `log_case_intake` RPC

**Files:**
- Apply via `mcp__Supabase__apply_migration`

- [ ] **Step 1: Apply the migration**

Call `mcp__Supabase__apply_migration` with `project_id: "ssmbegiyjivrcwgcqutu"`, `name: "log_case_intake_rpc"`, and this query:

```sql
CREATE OR REPLACE FUNCTION public.log_case_intake(
  p_case_id uuid,
  p_device_ids uuid[],
  p_depositor_name text DEFAULT NULL,
  p_depositor_mobile text DEFAULT NULL,
  p_depositor_id text DEFAULT NULL,
  p_depositor_relationship text DEFAULT NULL,
  p_receipt_instance_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_batch_id  uuid := gen_random_uuid();
  v_device    record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
    FROM cases WHERE id = p_case_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Case not found: %', p_case_id;
  END IF;

  IF v_tenant_id <> (SELECT get_current_tenant_id()) AND NOT (SELECT is_platform_admin()) THEN
    RAISE EXCEPTION 'Case belongs to another tenant';
  END IF;

  -- ID gate, mirroring log_case_checkout. A NULL relationship (legacy callers)
  -- is deliberately NOT gated, so this stays backward-compatible.
  IF p_depositor_relationship IS NOT NULL
     AND p_depositor_relationship <> 'self'
     AND coalesce(trim(p_depositor_id), '') = '' THEN
    RAISE EXCEPTION 'National ID is required when the depositor is not the customer';
  END IF;

  UPDATE case_devices
     SET received_at             = now(),
         intake_batch_id         = v_batch_id,
         depositor_name          = p_depositor_name,
         depositor_mobile        = p_depositor_mobile,
         depositor_id            = p_depositor_id,
         depositor_relationship  = p_depositor_relationship,
         received_by             = auth.uid()
   WHERE case_id = p_case_id
     AND id = ANY(p_device_ids)
     AND deleted_at IS NULL;

  -- Custody is APPEND-ONLY (prevent_audit_mutation). Never UPDATE the
  -- DEVICE_RECEIVED rows the intake trigger already wrote — append the
  -- receipt-signed evidence as its own event instead.
  FOR v_device IN
    SELECT id FROM case_devices
     WHERE case_id = p_case_id AND id = ANY(p_device_ids) AND deleted_at IS NULL
  LOOP
    PERFORM log_chain_of_custody(
      p_case_id          => p_case_id,
      p_action_category  => 'evidence_handling',
      p_action           => 'INTAKE_RECEIPT_SIGNED',
      p_description      => 'Signed check-in receipt recorded for this device',
      p_device_id        => v_device.id,
      p_metadata         => jsonb_build_object(
        'intake_batch_id',        v_batch_id,
        'receipt_instance_id',    p_receipt_instance_id,
        'depositor_relationship', p_depositor_relationship
      )
    );
  END LOOP;

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_case_intake(uuid, uuid[], text, text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.log_case_intake(uuid, uuid[], text, text, text, text, uuid) TO authenticated;
```

- [ ] **Step 2: Verify the ID gate fires**

Call `mcp__Supabase__execute_sql` with:

```sql
DO $$
BEGIN
  PERFORM log_case_intake(
    gen_random_uuid(), ARRAY[]::uuid[], 'Agent', NULL, '', 'courier', NULL
  );
  RAISE EXCEPTION 'GATE DID NOT FIRE';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'raised: %', SQLERRM;
END $$;
```

Expected: notice `raised: Case not found: ...` (the tenant/case check runs first — this confirms the function exists and raises rather than silently succeeding). The ID gate itself is covered end-to-end in Task 9.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "feat(db): add log_case_intake RPC recording intake evidence"
```

---

### Task 3: `staff_sign_off_document` RPC

**Files:**
- Apply via `mcp__Supabase__apply_migration`

- [ ] **Step 1: Apply the migration**

Call `mcp__Supabase__apply_migration` with `project_id: "ssmbegiyjivrcwgcqutu"`, `name: "staff_sign_off_document_rpc"`, and this query:

```sql
CREATE OR REPLACE FUNCTION public.staff_sign_off_document(
  p_instance_id       uuid,
  p_slot              signature_slot,
  p_method            signature_method,
  p_signer_name       text,
  p_typed_value       text DEFAULT NULL,
  p_signer_customer_id uuid DEFAULT NULL,
  p_user_agent        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    uuid;
  v_signature_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
    FROM document_instances WHERE id = p_instance_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Document instance not found: %', p_instance_id;
  END IF;

  IF v_tenant_id <> (SELECT get_current_tenant_id()) AND NOT (SELECT is_platform_admin()) THEN
    RAISE EXCEPTION 'Document belongs to another tenant';
  END IF;

  IF NOT (SELECT is_staff_user()) THEN
    RAISE EXCEPTION 'Only staff may capture a signature';
  END IF;

  IF coalesce(trim(p_signer_name), '') = '' THEN
    RAISE EXCEPTION 'Signer name is required';
  END IF;

  -- A customer-slot signature is the CUSTOMER's, captured on staff hardware.
  -- It must never be attributed to the staff user_id.
  INSERT INTO document_signatures (
    tenant_id, document_instance_id, slot, method, signer_name,
    typed_value, signer_customer_id, signer_user_id, user_agent
  ) VALUES (
    v_tenant_id, p_instance_id, p_slot, p_method, trim(p_signer_name),
    p_typed_value, p_signer_customer_id,
    CASE WHEN p_slot = 'customer' THEN NULL ELSE auth.uid() END,
    p_user_agent
  )
  RETURNING id INTO v_signature_id;

  RETURN jsonb_build_object('ok', true, 'signature_id', v_signature_id);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_sign_off_document(uuid, signature_slot, signature_method, text, text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.staff_sign_off_document(uuid, signature_slot, signature_method, text, text, uuid, text) TO authenticated;
```

- [ ] **Step 2: Regenerate types**

Run: `npm run db:types`
Expected: `log_case_intake` and `staff_sign_off_document` appear under `Functions` in `src/types/database.types.ts`.

Verify: `grep -c "staff_sign_off_document" src/types/database.types.ts`
Expected: at least 1.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.types.ts
git commit -m "feat(db): add staff_sign_off_document RPC for counter-captured signatures"
```

---

### Task 4: `DeviceData` intake fields + batch scoping in the receipt

**Files:**
- Modify: `src/lib/pdf/types.ts:50-68` (`DeviceData`), `src/lib/pdf/types.ts:133-137` (`ReceiptData`)
- Modify: `src/lib/pdf/engine/adapters/receiptAdapter.ts`
- Test: `src/lib/pdf/engine/adapters/receiptAdapter.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/adapters/receiptAdapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { devicesForReceipt } from './receiptAdapter';
import type { DeviceData } from '../../types';

const dev = (id: string, batch?: string, receivedAt?: string): DeviceData => ({
  id,
  intake_batch_id: batch,
  received_at: receivedAt,
});

describe('devicesForReceipt', () => {
  it('returns only the latest intake batch', () => {
    const devices = [
      dev('a', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('b', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('c', 'batch-2', '2026-08-04T09:00:00Z'),
    ];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['c']);
  });

  it('falls back to every device when no batch has been recorded', () => {
    const devices = [dev('a'), dev('b')];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('ignores unbatched devices when a batch exists', () => {
    const devices = [dev('a', 'batch-1', '2026-08-01T10:00:00Z'), dev('b')];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/adapters/receiptAdapter.test.ts`
Expected: FAIL — `devicesForReceipt` is not exported.

- [ ] **Step 3: Add the intake fields to `DeviceData`**

In `src/lib/pdf/types.ts`, inside `interface DeviceData` (after the `checkout_collector_relationship?: string;` line at :67), add:

```ts
  /** Per-device intake state (Stage 3). `received_at` null = not yet recorded. */
  received_at?: string;
  intake_batch_id?: string;
  depositor_name?: string;
  depositor_mobile?: string;
  depositor_id?: string;
  depositor_relationship?: string;
```

- [ ] **Step 4: Implement `devicesForReceipt`**

In `src/lib/pdf/engine/adapters/receiptAdapter.ts`, add after `intakeDeviceColumns()`:

```ts
/**
 * The devices a receipt covers: the LATEST intake batch only. Devices added to
 * the case after that handover must never appear on a re-render of the earlier
 * receipt. Mirrors the checkout adapter's latest-batch rule. Falls back to all
 * devices when no batch has been recorded (legacy cases, template preview).
 */
export function devicesForReceipt(devices: DeviceData[]): DeviceData[] {
  const batched = devices.filter((d) => d.intake_batch_id);
  if (batched.length === 0) return devices;
  const latest = batched.reduce((a, b) =>
    (a.received_at ?? '') >= (b.received_at ?? '') ? a : b,
  );
  return devices.filter((d) => d.intake_batch_id === latest.intake_batch_id);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/pdf/engine/adapters/receiptAdapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Use it in `toEngineData`**

In `receiptAdapter.ts`, replace line 185:

```ts
  const { caseData, devices, companySettings } = data;
```

with:

```ts
  const { caseData, companySettings } = data;
  const devices = devicesForReceipt(data.devices);
```

- [ ] **Step 7: Verify no regression in the existing parity suite**

Run: `npx vitest run src/lib/pdf/engine/officeReceiptParity.test.ts src/lib/pdf/engine/presentation.test.ts`
Expected: PASS — sample data carries no `intake_batch_id`, so the fallback keeps output byte-identical.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pdf/types.ts src/lib/pdf/engine/adapters/receiptAdapter.ts src/lib/pdf/engine/adapters/receiptAdapter.test.ts
git commit -m "feat(pdf): scope the check-in receipt to its intake batch"
```

---

### Task 5: Depositor block on the receipt

Reuses the existing generic `CollectorBlock` + `renderCollector` section — no new renderer.

**Files:**
- Modify: `src/lib/pdf/engine/adapters/receiptAdapter.ts`
- Test: `src/lib/pdf/engine/adapters/receiptAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/pdf/engine/adapters/receiptAdapter.test.ts`:

```ts
import { depositorBlock } from './receiptAdapter';

describe('depositorBlock', () => {
  it('returns null when no depositor was recorded', () => {
    expect(depositorBlock([dev('a')], 'Acme Ltd')).toBeNull();
  });

  it('reads "Delivered by customer" when the depositor is the customer', () => {
    const d: DeviceData = { ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Dana Reed', depositor_relationship: 'self' };
    const block = depositorBlock([d], 'Dana Reed');
    expect(block?.rows.find((r) => r.label.en === 'Delivered by')?.value)
      .toBe('Delivered by customer');
  });

  it('names the agent and the customer when the depositor is not the customer', () => {
    const d: DeviceData = { ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Sam Okafor', depositor_relationship: 'courier',
      depositor_id: 'P1234567', depositor_mobile: '+441234567890' };
    const block = depositorBlock([d], 'Acme Ltd');
    expect(block?.rows.find((r) => r.label.en === 'Delivered by')?.value)
      .toBe('Sam Okafor — on behalf of Acme Ltd');
    expect(block?.rows.find((r) => r.label.en === 'Relationship')?.value).toBe('Courier');
    expect(block?.rows.find((r) => r.label.en === 'National ID')?.value).toBe('P1234567');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/adapters/receiptAdapter.test.ts -t depositorBlock`
Expected: FAIL — `depositorBlock` is not exported.

- [ ] **Step 3: Implement `depositorBlock`**

In `receiptAdapter.ts`, add `CollectorBlock` to the type import from `'../types'`, then add:

```ts
const RELATIONSHIP_LABELS: Record<string, LabelText> = {
  self: { en: 'Customer', ar: 'العميل' },
  authorized_agent: { en: 'Authorized agent', ar: 'وكيل مفوض' },
  company_rep: { en: 'Company representative', ar: 'ممثل الشركة' },
  courier: { en: 'Courier', ar: 'مندوب شحن' },
};

/**
 * Who physically handed the devices over. Mirrors the checkout collector block:
 * `self` reads "Delivered by customer", anything else names the agent AND the
 * customer they acted for, with the National ID the RPC gate requires.
 * Returns null when no depositor was recorded (legacy cases) so the section
 * renders nothing rather than an empty box.
 */
export function depositorBlock(
  devices: DeviceData[],
  customerName: string,
): CollectorBlock | null {
  const source = devices.find((d) => d.depositor_name || d.depositor_relationship);
  if (!source) return null;

  const relationship = source.depositor_relationship ?? 'self';
  const name = safeString(source.depositor_name);
  const rows: CollectorBlock['rows'] = [
    {
      label: { en: 'Delivered by', ar: 'سُلّم بواسطة' },
      value:
        relationship === 'self'
          ? 'Delivered by customer'
          : `${name} — on behalf of ${customerName}`,
    },
  ];

  if (relationship !== 'self') {
    const label = RELATIONSHIP_LABELS[relationship];
    if (label) rows.push({ label: { en: 'Relationship', ar: 'الصلة' }, value: label.en });
    if (source.depositor_id) {
      rows.push({ label: { en: 'National ID', ar: 'رقم الهوية' }, value: source.depositor_id });
    }
    if (source.depositor_mobile) {
      rows.push({ label: { en: 'Mobile', ar: 'الجوال' }, value: source.depositor_mobile });
    }
  }

  if (source.received_at) {
    rows.push({
      label: { en: 'Received on', ar: 'تاريخ الاستلام' },
      value: formatDate(source.received_at),
    });
  }

  return { title: { en: 'Handover Information', ar: 'معلومات التسليم' }, rows };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pdf/engine/adapters/receiptAdapter.test.ts -t depositorBlock`
Expected: PASS (3 tests).

- [ ] **Step 5: Emit it from `toEngineData`**

In `receiptAdapter.ts`, in the returned object (around line 235, beside `devices: devicesBlock`), add:

```ts
    collector: depositorBlock(devices, to.name ?? ''),
```

If `PartyBlock` has no `name` field, use the same customer display string `customerParty` derives — read that function and pass the identical value.

- [ ] **Step 6: Verify parity suite still passes**

Run: `npx vitest run src/lib/pdf/engine/officeReceiptParity.test.ts`
Expected: PASS — sample data has no depositor, so `collector` is null and the section renders nothing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdf/engine/adapters/receiptAdapter.ts src/lib/pdf/engine/adapters/receiptAdapter.test.ts
git commit -m "feat(pdf): show the depositor handover block on the check-in receipt"
```

---

### Task 6: Captured signatures on the receipt

`EngineDocData.signatureBlocks` and its renderer already exist (`sections/signature.ts:117-133`). The adapter only needs to pass them through.

**Files:**
- Modify: `src/lib/pdf/types.ts:133-137` (`ReceiptData`)
- Modify: `src/lib/pdf/engine/adapters/receiptAdapter.ts`
- Test: `src/lib/pdf/engine/adapters/receiptAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/pdf/engine/adapters/receiptAdapter.test.ts`:

```ts
import { toEngineData } from './receiptAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../../templateConfig';
import type { ReceiptData } from '../../types';

const receipt = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  caseData: { case_no: 'CASE-0042' } as ReceiptData['caseData'],
  devices: [dev('a')],
  companySettings: {} as ReceiptData['companySettings'],
  ...over,
});

describe('toEngineData signature blocks', () => {
  it('leaves wet-ink caption lines when nothing was captured', () => {
    const out = toEngineData(receipt(), BUILT_IN_TEMPLATE_CONFIGS.customer_copy, 'customer');
    expect(out.signatureBlocks).toBeUndefined();
    expect(out.signatures?.[0].en).toBe('Customer Signature');
  });

  it('passes captured signatures through to signatureBlocks', () => {
    const out = toEngineData(
      receipt({ capturedSignatures: [{ slot: 'customer', name: 'Dana Reed', method: 'drawn', imageDataUrl: 'data:image/png;base64,AAA' }] }),
      BUILT_IN_TEMPLATE_CONFIGS.customer_copy,
      'customer',
    );
    expect(out.signatureBlocks).toHaveLength(1);
    expect(out.signatureBlocks?.[0].name).toBe('Dana Reed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/adapters/receiptAdapter.test.ts -t "signature blocks"`
Expected: FAIL — `capturedSignatures` is not a property of `ReceiptData`.

- [ ] **Step 3: Add `capturedSignatures` to `ReceiptData`**

In `src/lib/pdf/types.ts`, change `interface ReceiptData` (line 133) to:

```ts
export interface ReceiptData {
  caseData: CaseData;
  devices: DeviceData[];
  companySettings: CompanySettingsData;
  /**
   * Signatures captured at the counter (Stage 3). Absent/empty → the receipt
   * keeps its wet-ink caption lines, so paper-only labs are unaffected.
   */
  capturedSignatures?: SignatureBlockData[];
}
```

Add the import at the top of `src/lib/pdf/types.ts`:

```ts
import type { SignatureBlockData } from './engine/types';
```

- [ ] **Step 4: Pass it through in `toEngineData`**

In `receiptAdapter.ts`, in the returned object beside `signatures,` add:

```ts
    ...(data.capturedSignatures && data.capturedSignatures.length > 0
      ? { signatureBlocks: data.capturedSignatures }
      : {}),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/pdf/engine/adapters/receiptAdapter.test.ts`
Expected: PASS (all tests).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/types.ts src/lib/pdf/engine/adapters/receiptAdapter.ts src/lib/pdf/engine/adapters/receiptAdapter.test.ts
git commit -m "feat(pdf): embed captured signatures on the check-in receipt"
```

---

### Task 7: Fetch the intake columns and signatures

**Files:**
- Modify: `src/lib/pdf/dataFetcher.ts`

- [ ] **Step 1: Locate the receipt fetch**

Run: `grep -n "case_devices" src/lib/pdf/dataFetcher.ts`
Read the `ReceiptData` fetch function that result points at.

- [ ] **Step 2: Add the intake columns to the device select**

Extend the `case_devices` `.select(...)` string in that function with:

```
, received_at, intake_batch_id, depositor_name, depositor_mobile, depositor_id, depositor_relationship
```

and map them onto each returned `DeviceData` exactly as the `checkout_*` fields are mapped in the same function.

- [ ] **Step 3: Resolve captured signatures**

In the same function, after devices are fetched, add:

```ts
const { data: sigRows } = await supabase
  .from('document_signatures')
  .select('slot, signer_name, method, typed_value, signed_at, signature_image_bucket, signature_image_path')
  .eq('document_instance_id', instanceId)
  .is('deleted_at', null)
  .order('signed_at', { ascending: true });

const capturedSignatures: SignatureBlockData[] = await Promise.all(
  (sigRows ?? []).map(async (r) => ({
    slot: r.slot,
    name: r.signer_name,
    method: r.method,
    typedValue: r.typed_value ?? undefined,
    signedAt: r.signed_at,
    imageDataUrl:
      r.signature_image_bucket && r.signature_image_path
        ? await toDataUrl(r.signature_image_bucket, r.signature_image_path)
        : undefined,
  })),
);
```

Include `capturedSignatures` on the returned `ReceiptData`. `instanceId` is the document instance being rendered; if the existing fetch signature has no instance id, thread it through as an optional parameter defaulting to `undefined` and skip the query when absent (preview and legacy callers pass nothing and keep wet-ink lines).

Reuse the codebase's existing storage-to-data-URL helper for `toDataUrl` — find it with `grep -rn "createSignedUrl\|toDataUrl" src/lib/pdf/`. Do not write a second one.

- [ ] **Step 4: Typecheck and run the PDF suite**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npx vitest run src/lib/pdf/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/dataFetcher.ts
git commit -m "feat(pdf): fetch intake state and captured signatures for receipts"
```

---

### Task 8: Extract `createCaseWithDevices` (behavior-neutral)

**Files:**
- Create: `src/lib/caseIntakeService.ts`
- Modify: `src/components/cases/CreateCaseWizard.tsx:349-497`

- [ ] **Step 1: Create the service with the exact wizard sequence**

Create `src/lib/caseIntakeService.ts`:

```ts
import { supabase } from './supabaseClient';
import { logger } from './logger';
import { getIntakeStatusForCreation } from './caseService';
import { setPrimaryDevice } from './deviceService';
import type { Database } from '../types/database.types';

type CasesInsert = Database['public']['Tables']['cases']['Insert'];
type CaseDeviceInsert = Database['public']['Tables']['case_devices']['Insert'];

export interface CreateCaseWithDevicesInput {
  tenantId: string;
  profileId: string | null;
  profileRole: string | null;
  customerId: string;
  customerName: string;
  priority: CasesInsert['priority'];
  contactId?: string | null;
  clientReference?: string | null;
  serviceTypeId?: string | null;
  serviceLocationId?: string | null;
  companyId?: string | null;
  /** Devices to insert. `isPrimary` marks the patient device. */
  devices: Array<Omit<CaseDeviceInsert, 'tenant_id' | 'case_id'> & { isPrimary?: boolean }>;
}

export interface CreateCaseWithDevicesResult {
  caseId: string;
  caseNumber: string;
  deviceIds: string[];
}

/**
 * The single case-creation path, extracted verbatim from CreateCaseWizard so the
 * wizard and the front-desk check-in surface cannot drift. Order matters: the
 * guard trigger on `cases` requires a matched active intake status_id + name
 * pair on INSERT.
 */
export async function createCaseWithDevices(
  input: CreateCaseWithDevicesInput,
): Promise<CreateCaseWithDevicesResult> {
  const { data: caseNumber, error: numberError } = await supabase
    .rpc('get_next_number', { p_scope: 'case' });

  if (numberError) {
    logger.error('Error generating case number:', numberError);
    if (numberError.message?.includes('not found')) {
      throw new Error('Case numbering system is not configured. Please contact your system administrator to configure it in Settings > System & Numbers.');
    }
    throw new Error(`Failed to generate case number: ${numberError.message}`);
  }
  if (!caseNumber) {
    throw new Error('Failed to generate case number. Please try again or contact support.');
  }

  const intakeStatus = await getIntakeStatusForCreation();

  const caseData: CasesInsert = {
    tenant_id: input.tenantId,
    case_number: caseNumber,
    customer_id: input.customerId,
    subject: `Case for ${input.customerName}`,
    priority: input.priority,
    status: intakeStatus.name,
    status_id: intakeStatus.id,
    phase_entered_at: new Date().toISOString(),
  };
  if (input.contactId) caseData.contact_id = input.contactId;
  if (input.clientReference) caseData.client_reference = input.clientReference;
  if (input.serviceTypeId) caseData.service_type_id = input.serviceTypeId;
  if (input.serviceLocationId) caseData.service_location_id = input.serviceLocationId;
  if (input.companyId) caseData.company_id = input.companyId;
  if (input.profileId) {
    caseData.created_by = input.profileId;
    if (input.profileRole === 'technician') caseData.assigned_to = input.profileId;
  }

  const { data: newCase, error: caseError } = await supabase
    .from('cases').insert(caseData).select().maybeSingle();

  if (caseError) {
    logger.error('Error creating case:', caseError);
    throw new Error(`Failed to create case: ${caseError.message}`);
  }
  if (!newCase) throw new Error('Case was created but no row was returned.');

  const deviceIds: string[] = [];
  if (input.devices.length > 0) {
    const rows: CaseDeviceInsert[] = input.devices.map(({ isPrimary: _p, ...rest }) => ({
      ...rest,
      tenant_id: input.tenantId,
      case_id: newCase.id,
    }));
    const { data: inserted, error: devicesError } = await supabase
      .from('case_devices').insert(rows).select('id');

    if (devicesError) {
      logger.error('Error inserting devices:', devicesError);
      throw new Error(`Failed to insert devices: ${devicesError.message}`);
    }

    (inserted ?? []).forEach((d) => deviceIds.push(d.id));

    const primaryIndex = input.devices.findIndex((d) => d.isPrimary);
    const primaryId = deviceIds[primaryIndex >= 0 ? primaryIndex : 0];
    if (primaryId) await setPrimaryDevice(primaryId, newCase.id);
  }

  return { caseId: newCase.id, caseNumber, deviceIds };
}
```

- [ ] **Step 2: Point the wizard at it**

In `src/components/cases/CreateCaseWizard.tsx`, replace the whole body of `createCaseMutation.mutationFn` (lines 350-497) with:

```ts
    mutationFn: async () => {
      if (!profile?.tenant_id) {
        throw new Error('No active tenant — please sign in again.');
      }
      const tenantId = profile.tenant_id;
      const customerName =
        customers.find((c) => c.id === formData.customer_id)?.customer_name || 'Customer';

      // Auto-populate company_id from the customer's primary company relationship.
      let companyId: string | null = null;
      if (formData.customer_id) {
        const { data: customerCompany } = await supabase
          .from('customer_company_relationships')
          .select('company_id')
          .eq('customer_id', formData.customer_id)
          .is('deleted_at', null)
          .order('is_primary', { ascending: false })
          .limit(1)
          .maybeSingle();
        companyId = customerCompany?.company_id ?? null;
      }

      const allDevices = [...devices, ...bulkServerDrives];
      const primaryWizardDevice = allDevices.find((d) => d.is_primary);

      const result = await createCaseWithDevices({
        tenantId,
        profileId: profile?.id ?? null,
        profileRole: profile?.role ?? null,
        customerId: formData.customer_id,
        customerName,
        priority: formData.priority,
        contactId: formData.contact_id || null,
        clientReference: formData.client_reference || null,
        serviceTypeId: formData.service_type_id || null,
        serviceLocationId: formData.service_location_id || null,
        companyId,
        devices: allDevices
          .filter((d) => d.device_type_id || d.serial_no)
          .map((device) => ({
            device_type_id: device.device_type_id || null,
            brand_id: device.brand_id || null,
            model: device.model || null,
            serial_number: device.serial_no || null,
            capacity_id: device.capacity_id || null,
            condition_id: device.condition_id || null,
            accessories: device.accessories.length > 0 ? device.accessories : null,
            symptoms: device.device_problem_id
              ? serviceProblems.find((sp) => sp.id === device.device_problem_id)?.name || null
              : null,
            notes: device.recovery_requirements || null,
            password: device.device_password || null,
            encryption_id: device.encryption_type_id || null,
            device_role_id: device.device_role_id || null,
            created_by: profile?.id || null,
            isPrimary: primaryWizardDevice ? device.id === primaryWizardDevice.id : false,
          })),
      });

      const { data: newCase } = await supabase
        .from('cases').select().eq('id', result.caseId).maybeSingle();
      if (!newCase) throw new Error('Case was created but no row was returned.');
      return newCase;
    },
```

Add `import { createCaseWithDevices } from '../../lib/caseIntakeService';` at the top. Remove the now-unused `getIntakeStatusForCreation` and `setPrimaryDevice` imports if nothing else in the file references them — `npm run lint` will flag them if left.

- [ ] **Step 3: Run the wizard tests**

Run: `npx vitest run src/components/cases/`
Expected: PASS — this refactor is behavior-neutral; any failure means the sequence changed.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/caseIntakeService.ts src/components/cases/CreateCaseWizard.tsx
git commit -m "refactor(cases): extract createCaseWithDevices into caseIntakeService"
```

---

### Task 9: Intake evidence + consent service functions

**Files:**
- Modify: `src/lib/caseIntakeService.ts`
- Test: `src/lib/caseIntakeService.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/caseIntakeService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const insert = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ insert: (...a: unknown[]) => insert(...a) }),
  },
}));

import { logCaseIntake, requireDepositorId } from './caseIntakeService';

beforeEach(() => { rpc.mockReset(); insert.mockReset(); });

describe('requireDepositorId', () => {
  it('is false for the customer themselves', () => {
    expect(requireDepositorId('self')).toBe(false);
  });
  it('is true for every other relationship', () => {
    expect(requireDepositorId('courier')).toBe(true);
    expect(requireDepositorId('authorized_agent')).toBe(true);
    expect(requireDepositorId('company_rep')).toBe(true);
  });
});

describe('logCaseIntake', () => {
  it('rejects a non-self depositor with no ID before hitting the network', async () => {
    await expect(logCaseIntake({
      caseId: 'c1', deviceIds: ['d1'], depositorName: 'Sam',
      depositorRelationship: 'courier', depositorId: '  ',
    })).rejects.toThrow(/National ID is required/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls the RPC with the full parameter set', async () => {
    rpc.mockResolvedValue({ data: 'batch-1', error: null });
    const batch = await logCaseIntake({
      caseId: 'c1', deviceIds: ['d1'], depositorName: 'Dana',
      depositorRelationship: 'self', receiptInstanceId: 'i1',
    });
    expect(batch).toBe('batch-1');
    expect(rpc).toHaveBeenCalledWith('log_case_intake', expect.objectContaining({
      p_case_id: 'c1', p_device_ids: ['d1'], p_receipt_instance_id: 'i1',
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/caseIntakeService.test.ts`
Expected: FAIL — `logCaseIntake` is not exported.

- [ ] **Step 3: Implement the evidence functions**

Append to `src/lib/caseIntakeService.ts`:

```ts
import type { CapturedSignature } from '../components/cases/SignatureCaptureModal';

export type DepositorRelationship = 'self' | 'authorized_agent' | 'company_rep' | 'courier';

/** Client-side mirror of the log_case_intake ID gate. */
export function requireDepositorId(relationship: DepositorRelationship): boolean {
  return relationship !== 'self';
}

export interface LogCaseIntakeInput {
  caseId: string;
  deviceIds: string[];
  depositorName?: string | null;
  depositorMobile?: string | null;
  depositorId?: string | null;
  depositorRelationship?: DepositorRelationship | null;
  receiptInstanceId?: string | null;
}

/** Stamps per-device intake state and appends the INTAKE_RECEIPT_SIGNED custody event. */
export async function logCaseIntake(input: LogCaseIntakeInput): Promise<string> {
  if (
    input.depositorRelationship &&
    requireDepositorId(input.depositorRelationship) &&
    (input.depositorId ?? '').trim() === ''
  ) {
    throw new Error('National ID is required when the depositor is not the customer');
  }

  const { data, error } = await supabase.rpc('log_case_intake', {
    p_case_id: input.caseId,
    p_device_ids: input.deviceIds,
    p_depositor_name: input.depositorName ?? null,
    p_depositor_mobile: input.depositorMobile ?? null,
    p_depositor_id: input.depositorId ?? null,
    p_depositor_relationship: input.depositorRelationship ?? null,
    p_receipt_instance_id: input.receiptInstanceId ?? null,
  });

  if (error) {
    logger.error('Error logging case intake:', error);
    throw error;
  }
  return (data ?? '') as string;
}

/** Persists a counter-captured customer signature against the receipt instance. */
export async function signIntakeReceipt(
  instanceId: string,
  sig: CapturedSignature,
  customerId: string,
): Promise<string> {
  const signerName = sig.method === 'typed' ? (sig.typedValue ?? '') : (sig.signerName ?? '');
  const { data, error } = await supabase.rpc('staff_sign_off_document', {
    p_instance_id: instanceId,
    p_slot: 'customer',
    p_method: sig.method,
    p_signer_name: signerName,
    p_typed_value: sig.typedValue ?? undefined,
    p_signer_customer_id: customerId,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  });
  if (error) {
    logger.error('Error signing intake receipt:', error);
    throw error;
  }
  const result = data as { signature_id?: string } | null;
  if (!result?.signature_id) throw new Error('Sign-off did not return a signature id');
  return result.signature_id;
}

export interface IntakeConsents {
  tenantId: string;
  customerId: string;
  caseId: string;
  phoneE164?: string | null;
  /** WhatsApp utility notifications. Declining is valid and must not block intake. */
  whatsappUtility: boolean;
  /** Authorization for recovery attempts that may permanently alter the media. */
  destructiveAuthorized: boolean;
  consentText: string;
}

/**
 * Records consent as separable facts, each independently provable. Marketing
 * scope is deliberately never written at intake — bundling it into a service
 * signature is the dark pattern GDPR Art. 7(2) prohibits.
 * whatsapp_consents is append-only: insert, never update.
 */
export async function captureIntakeConsents(input: IntakeConsents): Promise<void> {
  if (input.whatsappUtility) {
    const { error } = await supabase.from('whatsapp_consents').insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      scope: 'utility',
      action: 'opt_in',
      source: 'intake_form',
      phone_e164: input.phoneE164 ?? null,
      consent_text: input.consentText,
    });
    if (error) {
      logger.error('Error recording intake consent:', error);
      throw error;
    }
  }

  if (input.destructiveAuthorized) {
    const { error: noteError } = await supabase.from('case_internal_notes').insert({
      tenant_id: input.tenantId,
      case_id: input.caseId,
      content: 'Customer authorized recovery attempts that may permanently alter the media (captured at check-in).',
    });
    if (noteError) {
      logger.error('Error recording destructive-attempt authorization:', noteError);
      throw noteError;
    }

    const { error: custodyError } = await supabase.rpc('log_chain_of_custody', {
      p_case_id: input.caseId,
      p_action_category: 'evidence_handling',
      p_action: 'DESTRUCTIVE_ATTEMPT_AUTHORIZED',
      p_description: 'Customer authorized potentially destructive recovery attempts at check-in',
      p_metadata: { source: 'intake_checkin' },
    });
    if (custodyError) {
      logger.error('Error logging destructive-attempt custody event:', custodyError);
      throw custodyError;
    }
  }
}
```

**Verified against the live schema:** `case_internal_notes` columns are `id, tenant_id, case_id, content, created_by, created_at, updated_at, deleted_at, updated_by` — the body column is `content`. `log_chain_of_custody` takes `p_action_category` as **`text`**, not the `custody_action_category` enum, and every parameter except `p_case_id` has a default, so the named-argument call above is valid.

**Import placement:** the `CapturedSignature` type import above belongs at the TOP of `caseIntakeService.ts` with the other imports, not inline where this snippet appears.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/caseIntakeService.test.ts`
Expected: PASS (4 tests).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/caseIntakeService.ts src/lib/caseIntakeService.test.ts
git commit -m "feat(cases): add intake evidence and consent capture service"
```

---

### Task 10: Depositor section component

**Files:**
- Create: `src/components/cases/checkin/DepositorSection.tsx`
- Test: `src/components/cases/checkin/DepositorSection.test.tsx`

Load the `ui-ux-pro-max` and `frontend-design` skills before this task — it is UI-facing (CLAUDE.md skill gate).

- [ ] **Step 1: Write the failing test**

Create `src/components/cases/checkin/DepositorSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DepositorSection } from './DepositorSection';

const base = {
  value: { name: 'Dana Reed', mobile: '', nationalId: '', relationship: 'self' as const },
  customerName: 'Dana Reed',
  onChange: vi.fn(),
};

describe('DepositorSection', () => {
  it('hides the National ID field when the customer collects for themselves', () => {
    render(<DepositorSection {...base} />);
    expect(screen.queryByLabelText(/national id/i)).not.toBeInTheDocument();
  });

  it('requires National ID once the relationship is not self', async () => {
    const onChange = vi.fn();
    render(<DepositorSection {...base} value={{ ...base.value, relationship: 'courier' }} onChange={onChange} />);
    const idField = screen.getByLabelText(/national id/i);
    expect(idField).toBeRequired();
  });

  it('clears the customer prefill when switching off self', async () => {
    const onChange = vi.fn();
    render(<DepositorSection {...base} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/relationship/i), 'courier');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ relationship: 'courier', name: '', nationalId: '' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/cases/checkin/DepositorSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/cases/checkin/DepositorSection.tsx`:

```tsx
import { Input } from '../../ui/Input';
import type { DepositorRelationship } from '../../../lib/caseIntakeService';
import { requireDepositorId } from '../../../lib/caseIntakeService';

export interface DepositorValue {
  name: string;
  mobile: string;
  nationalId: string;
  relationship: DepositorRelationship;
}

interface DepositorSectionProps {
  value: DepositorValue;
  customerName: string;
  onChange: (next: DepositorValue) => void;
}

const RELATIONSHIPS: { id: DepositorRelationship; label: string }[] = [
  { id: 'self', label: 'The customer themselves' },
  { id: 'authorized_agent', label: 'Authorized agent' },
  { id: 'company_rep', label: 'Company representative' },
  { id: 'courier', label: 'Courier' },
];

/**
 * Who physically handed the devices over. Switching off `self` clears the
 * customer prefill so staff cannot leave a stale name attached to a courier,
 * and makes National ID required — mirroring the log_case_intake gate.
 */
export function DepositorSection({ value, customerName, onChange }: DepositorSectionProps) {
  const idRequired = requireDepositorId(value.relationship);

  function handleRelationship(relationship: DepositorRelationship) {
    onChange(
      relationship === 'self'
        ? { relationship, name: customerName, mobile: value.mobile, nationalId: '' }
        : { relationship, name: '', mobile: '', nationalId: '' },
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Who is handing the devices over?</h2>
        <p className="mt-1 text-sm text-slate-500">
          Recorded on the check-in receipt as proof of handover.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="depositor-relationship" className="block text-sm font-medium text-slate-700">
            Relationship
          </label>
          <select
            id="depositor-relationship"
            aria-label="Relationship"
            value={value.relationship}
            onChange={(e) => handleRelationship(e.target.value as DepositorRelationship)}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>

        <Input
          floatingLabel
          label="Full name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          required
        />

        <Input
          floatingLabel
          label="Mobile"
          value={value.mobile}
          onChange={(e) => onChange({ ...value, mobile: e.target.value })}
        />

        {idRequired && (
          <Input
            floatingLabel
            label="National ID"
            value={value.nationalId}
            onChange={(e) => onChange({ ...value, nationalId: e.target.value })}
            required
          />
        )}
      </div>
    </section>
  );
}
```

If `Input`'s prop contract differs (check `src/components/ui/Input.tsx` for whether the label prop renders an associated `<label>`), adjust so `getByLabelText` resolves — the tests are the contract.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/cases/checkin/DepositorSection.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/cases/checkin/DepositorSection.tsx src/components/cases/checkin/DepositorSection.test.tsx
git commit -m "feat(cases): add depositor capture section for check-in"
```

---

### Task 11: Acknowledge & sign section

**Files:**
- Create: `src/components/cases/checkin/AcknowledgeSection.tsx`
- Test: `src/components/cases/checkin/AcknowledgeSection.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/cases/checkin/AcknowledgeSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { AcknowledgeSection } from './AcknowledgeSection';

vi.mock('../SignatureCaptureModal', () => ({
  SignatureCaptureModal: ({ open, onCapture }: { open: boolean; onCapture: (s: unknown) => void }) =>
    open ? <button onClick={() => onCapture({ method: 'typed', typedValue: 'Dana Reed' })}>capture</button> : null,
}));

const base = {
  value: { termsAccepted: false, whatsappUtility: false, destructiveAuthorized: false, signature: null },
  onChange: vi.fn(),
};

describe('AcknowledgeSection', () => {
  it('blocks signing until the terms checkbox is ticked', () => {
    render(<AcknowledgeSection {...base} />);
    expect(screen.getByRole('button', { name: /capture signature/i })).toBeDisabled();
  });

  it('enables signing once terms are accepted', () => {
    render(<AcknowledgeSection {...base} value={{ ...base.value, termsAccepted: true }} />);
    expect(screen.getByRole('button', { name: /capture signature/i })).toBeEnabled();
  });

  it('records each consent independently', async () => {
    const onChange = vi.fn();
    render(<AcknowledgeSection {...base} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText(/whatsapp/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappUtility: true, termsAccepted: false }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/cases/checkin/AcknowledgeSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/cases/checkin/AcknowledgeSection.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '../../ui/Button';
import { SignatureCaptureModal } from '../SignatureCaptureModal';
import type { CapturedSignature } from '../SignatureCaptureModal';

export const INTAKE_CONSENT_TEXT =
  'I confirm that I am the owner or authorized representative of the device(s) listed on this receipt and authorize the lab to proceed with the service.';

export interface AcknowledgeValue {
  termsAccepted: boolean;
  whatsappUtility: boolean;
  destructiveAuthorized: boolean;
  signature: CapturedSignature | null;
}

interface AcknowledgeSectionProps {
  value: AcknowledgeValue;
  onChange: (next: AcknowledgeValue) => void;
}

/**
 * Three INDEPENDENT consents plus the signature. They are never bundled into a
 * single "I agree": bundling is what makes each consent individually unprovable.
 * Only the service-authorization consent blocks completion.
 */
export function AcknowledgeSection({ value, onChange }: AcknowledgeSectionProps) {
  const [signing, setSigning] = useState(false);

  const checkbox = (
    id: string,
    label: string,
    checked: boolean,
    key: keyof Omit<AcknowledgeValue, 'signature'>,
  ) => (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
        className="mt-0.5 h-4 w-4 rounded border-border text-primary accent-primary"
      />
      <label htmlFor={id} className="text-sm text-slate-700">{label}</label>
    </div>
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Acknowledge &amp; sign</h2>
        <p className="mt-1 text-sm text-slate-500">Hand the device to the customer for this step.</p>
      </div>

      <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-slate-700">
        {INTAKE_CONSENT_TEXT}
      </p>

      <div className="space-y-3">
        {checkbox('ack-terms', 'I accept the terms of service and authorize the lab to proceed.', value.termsAccepted, 'termsAccepted')}
        {checkbox('ack-whatsapp', 'Send me WhatsApp updates about this case.', value.whatsappUtility, 'whatsappUtility')}
        {checkbox('ack-destructive', 'I authorize recovery attempts that may permanently alter the media.', value.destructiveAuthorized, 'destructiveAuthorized')}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" disabled={!value.termsAccepted} onClick={() => setSigning(true)}>
          Capture signature
        </Button>
        {value.signature && <span className="text-sm text-success">Signature captured</span>}
      </div>

      <SignatureCaptureModal
        open={signing}
        onClose={() => setSigning(false)}
        title="Customer signature"
        allowedMethods={['drawn', 'typed', 'click_to_accept']}
        onCapture={(sig) => onChange({ ...value, signature: sig })}
      />
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/cases/checkin/AcknowledgeSection.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/cases/checkin/AcknowledgeSection.tsx src/components/cases/checkin/AcknowledgeSection.test.tsx
git commit -m "feat(cases): add intake acknowledgement and signature section"
```

---

### Task 12: The check-in page and route

**Files:**
- Create: `src/pages/cases/CaseCheckIn.tsx`
- Create: `src/components/cases/checkin/IntakeDeviceRows.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build the device rows component**

Create `src/components/cases/checkin/IntakeDeviceRows.tsx`:

```tsx
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';

export interface CatalogOption { id: string; name: string }

export interface IntakeDeviceValue {
  key: string;
  device_type_id: string | null;
  brand_id: string | null;
  model: string;
  serial_number: string;
  capacity_id: string | null;
  condition_id: string | null;
  notes: string;
}

export function emptyDevice(key: string): IntakeDeviceValue {
  return {
    key,
    device_type_id: null, brand_id: null, model: '', serial_number: '',
    capacity_id: null, condition_id: null, notes: '',
  };
}

/** Every device must have a recorded condition — the lab's only defense against
 *  a later "it arrived damaged" claim. The parent disables submit on false. */
export function devicesAreComplete(devices: IntakeDeviceValue[]): boolean {
  return devices.length > 0 && devices.every((d) => d.condition_id !== null);
}

interface IntakeDeviceRowsProps {
  value: IntakeDeviceValue[];
  deviceTypes: CatalogOption[];
  brands: CatalogOption[];
  capacities: CatalogOption[];
  conditions: CatalogOption[];
  onChange: (next: IntakeDeviceValue[]) => void;
}

export function IntakeDeviceRows({
  value, deviceTypes, brands, capacities, conditions, onChange,
}: IntakeDeviceRowsProps) {
  function update(key: string, patch: Partial<IntakeDeviceValue>) {
    onChange(value.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  const select = (
    id: string, label: string, options: CatalogOption[],
    selected: string | null, onPick: (v: string | null) => void, required = false,
  ) => (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <select
        id={id}
        aria-label={label}
        required={required}
        value={selected ?? ''}
        onChange={(e) => onPick(e.target.value || null)}
        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Select…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Devices received</h2>
        <p className="mt-1 text-sm text-slate-500">
          Each device is tracked individually. Condition is required.
        </p>
      </div>

      {value.map((d, i) => (
        <div key={d.key} className="space-y-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Device {i + 1}</span>
            {value.length > 1 && (
              <button
                type="button"
                aria-label={`Remove device ${i + 1}`}
                onClick={() => onChange(value.filter((x) => x.key !== d.key))}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {select(`type-${d.key}`, 'Device type', deviceTypes, d.device_type_id,
              (v) => update(d.key, { device_type_id: v }))}
            {select(`brand-${d.key}`, 'Brand', brands, d.brand_id,
              (v) => update(d.key, { brand_id: v }))}
            <Input floatingLabel label="Model" value={d.model}
              onChange={(e) => update(d.key, { model: e.target.value })} />
            <Input floatingLabel label="Serial number" value={d.serial_number}
              onChange={(e) => update(d.key, { serial_number: e.target.value })} />
            {select(`capacity-${d.key}`, 'Capacity', capacities, d.capacity_id,
              (v) => update(d.key, { capacity_id: v }))}
            {select(`condition-${d.key}`, 'Condition', conditions, d.condition_id,
              (v) => update(d.key, { condition_id: v }), true)}
          </div>

          <Input floatingLabel label="Visible damage / notes" value={d.notes}
            onChange={(e) => update(d.key, { notes: e.target.value })} />
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...value, emptyDevice(`d${value.length + 1}-${value.length}`)])}
      >
        <Plus className="mr-1.5 h-4 w-4" /> Add device
      </Button>
    </section>
  );
}
```

The parent owns the catalog queries (`catalog_device_types`, `catalog_device_brands`, `catalog_device_capacities`, `catalog_device_conditions`) — copy the exact query shape `CreateCaseWizard` uses and map each result to `{ id, name }`.

- [ ] **Step 2: Build the page**

Create `src/pages/cases/CaseCheckIn.tsx` composing, in order: a customer picker (search `customers_enhanced`, create inline via `CustomerFormModal`), `DepositorSection`, `IntakeDeviceRows`, `AcknowledgeSection`. On submit, run this exact sequence:

```ts
const { caseId, caseNumber, deviceIds } = await createCaseWithDevices({ /* … */ });

const instance = await createDocumentInstance({
  docType: 'customer_copy',
  title: `Check-in receipt ${caseNumber}`,
  caseId,
  customerId,
});

if (ack.signature) {
  await signIntakeReceipt(instance.id, ack.signature, customerId);
}

await logCaseIntake({
  caseId,
  deviceIds,
  depositorName: depositor.name,
  depositorMobile: depositor.mobile,
  depositorId: depositor.nationalId,
  depositorRelationship: depositor.relationship,
  receiptInstanceId: instance.id,
});

await captureIntakeConsents({
  tenantId, customerId, caseId,
  phoneE164: customerPhone,
  whatsappUtility: ack.whatsappUtility,
  destructiveAuthorized: ack.destructiveAuthorized,
  consentText: INTAKE_CONSENT_TEXT,
});

// Label printing is fire-and-forget: a printer fault must never block intake
// or lose the evidence already written above. Mirrors CreateCaseWizard:504-509.
void shouldAutoPrintLabel('case').then(async (enabled) => {
  if (!enabled) return;
  const { printCaseLabels } = await import('../../lib/pdf/labels/labelPrintService');
  await printCaseLabels(caseId, { output: 'print' });
});
```

Then hand the customer their copy: navigate to a success state offering **Print** (always available) and **Send** (enabled only when `ack.whatsappUtility` is true or the customer has an email), reusing the `EmailDocumentModal` pattern `CaseSuccessModal.tsx:109-115` already uses with `documentType="office_receipt"` — pass `documentType="customer_copy"` here.

Signature capture is optional (Decision 6 — wet-ink labs must still complete). Order matters: `logCaseIntake` runs **after** signing so the appended custody event carries the receipt instance id, and consent capture runs after that so a consent failure cannot orphan the custody evidence.

- [ ] **Step 3: Register the route**

In `src/App.tsx`, add the route beside the other `/cases` routes, matching their lazy-import and guard pattern:

```tsx
<Route path="/cases/check-in" element={<CaseCheckIn />} />
```

Gate it to staff exactly as sibling case routes do — check how `/cases/new` is guarded and mirror it; `viewer` must not reach it.

- [ ] **Step 4: Verify the whole suite and the gates**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/cases/CaseCheckIn.tsx src/components/cases/checkin/IntakeDeviceRows.tsx src/App.tsx
git commit -m "feat(cases): add front-desk check-in surface"
```

---

## Verification

Before claiming completion, run all four gates and paste the output:

```bash
npm run typecheck && npm test && npm run lint && npm run check:schema-drift
```

Manual check that no automated test covers: create a case through `/cases/check-in` with a courier depositor, confirm the receipt PDF shows "on behalf of" plus the National ID, then add a device to that case and re-render the receipt — the new device must **not** appear.

---

## Notes for the implementer

- **Never UPDATE `chain_of_custody`.** It is append-only (REVOKE + `prevent_audit_mutation`). Task 2 appends an event; do not "simplify" it into an update of the `DEVICE_RECEIVED` row.
- **Never hand-edit `src/types/database.types.ts`.** Regenerate with `npm run db:types`.
- **Wet-ink must keep working.** Every signature path is additive; a lab with no tablet completes check-in with zero captured signatures.
- **Out of scope here:** OTP identity verification (spec 2), ID document upload, and the `log_case_checkout` `check_violation` defect (tracked separately).
