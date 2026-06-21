# Custody Visibility (Workstream A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the device-collection / custody data the platform already records — in the Admin Audit Log, on each device, and on the customer profile — without any schema change.

**Architecture:** Read-only. Reuse the existing custody read layer (`chainOfCustodyService.getChainOfCustody`, `chain_of_custody`/`case_job_history` tables) and the existing timeline renderers (`CaseActivityTab`, `ChainOfCustodyTab`). Three independent surfaces, each its own phase; each ships working software on its own. Tenant-scoped RLS already isolates the data; the Customer Timeline is **tenant-staff-only** (lives on the tenant `CustomerProfilePage`, not the portal — per the accepted decision).

**Tech Stack:** React 18 + TypeScript, TanStack Query v5, Supabase (PostgREST), Tailwind tokens, vitest + @testing-library/react.

---

## File structure

| File | Responsibility | Create/Modify |
|---|---|---|
| `src/lib/chainOfCustodyService.ts` | Add `fetchCustodyFeed` (tenant-wide) + `fetchCustomerTimeline` (per-customer) readers | Modify |
| `src/components/cases/AuditCustodyFeed.tsx` | Presentational tenant custody feed list | Create |
| `src/pages/admin/AuditTrails.tsx` | Add a System/Custody scope toggle | Modify |
| `src/components/cases/ChainOfCustodyTab.tsx` | Add optional `deviceId` filter | Modify |
| `src/components/cases/detail/CaseDevicesTab.tsx` | Per-device "History" disclosure | Modify |
| `src/components/shared/ActivityTimeline.tsx` | Shared presentational timeline (extracted from `CaseActivityTab`) | Create |
| `src/components/cases/detail/CaseActivityTab.tsx` | Reuse `ActivityTimeline` (DRY) | Modify |
| `src/components/customers/CustomerTimelineTab.tsx` | Customer-wide activity timeline | Create |
| `src/pages/customers/CustomerProfilePage.tsx` | Register the `timeline` tab | Modify |
| `src/lib/queryKeys.ts` | `customerKeys.timeline(id)`, `custodyKeys.feed(...)` | Modify |

---

## Phase 1 — Admin Audit Log: tenant custody feed (G2)

### Task 1: `fetchCustodyFeed` service reader

**Files:**
- Modify: `src/lib/chainOfCustodyService.ts`
- Test: `src/lib/chainOfCustodyService.feed.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const range = vi.fn();
const order = vi.fn(() => ({ range }));
const orFn = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ order, or: orFn }));
vi.mock('./supabaseClient', () => ({
  supabase: { from: vi.fn(() => ({ select })) },
}));
vi.mock('./postgrestSanitizer', () => ({ sanitizeFilterValue: (s: string) => s }));
vi.mock('./logger', () => ({ logger: { error: vi.fn() } }));

import { fetchCustodyFeed } from './chainOfCustodyService';

describe('fetchCustodyFeed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps the embedded case_no and returns the count', async () => {
    range.mockResolvedValueOnce({
      data: [{ id: 'c1', case_id: 'k1', device_id: 'd1', action: 'DEVICE_CHECKED_OUT',
               action_category: 'transfer', description: 'released', actor_name: 'Tech A',
               custody_status: 'checked_out', created_at: '2026-06-19T00:00:00Z',
               cases: { case_no: 'C-0032' } }],
      error: null, count: 1,
    });
    const res = await fetchCustodyFeed({ page: 0, pageSize: 50 });
    expect(res.total).toBe(1);
    expect(res.rows[0].case_no).toBe('C-0032');
    expect(res.rows[0].action).toBe('DEVICE_CHECKED_OUT');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chainOfCustodyService.feed.test.ts`
Expected: FAIL — `fetchCustodyFeed is not a function`.

- [ ] **Step 3: Implement `fetchCustodyFeed`**

Add to `src/lib/chainOfCustodyService.ts` (the file already imports `supabase` and `logger`; add the `sanitizeFilterValue` import at top: `import { sanitizeFilterValue } from './postgrestSanitizer';`):

```ts
export interface CustodyFeedRow {
  id: string;
  case_id: string;
  device_id: string | null;
  action: string;
  action_category: string;
  description: string | null;
  actor_name: string | null;
  custody_status: string | null;
  created_at: string;
  case_no: string | null;
}

/** Tenant-wide custody ledger feed for the admin audit view. RLS already
 *  scopes rows to the current tenant (platform admins see all). */
export async function fetchCustodyFeed(opts: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<{ rows: CustodyFeedRow[]; total: number }> {
  const { page, pageSize, search } = opts;
  let query = supabase
    .from('chain_of_custody')
    .select(
      'id, case_id, device_id, action, action_category, description, actor_name, custody_status, created_at, cases:case_id(case_no)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (search) {
    const s = sanitizeFilterValue(search);
    query = query.or(`action.ilike.%${s}%,description.ilike.%${s}%,actor_name.ilike.%${s}%`);
  }

  const { data, error, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) {
    logger.error('Error fetching custody feed:', error);
    throw error;
  }
  const rows = (data ?? []).map((r) => {
    const row = r as unknown as CustodyFeedRow & { cases?: { case_no?: string | null } | null };
    return { ...row, case_no: row.cases?.case_no ?? null };
  });
  return { rows, total: count ?? 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chainOfCustodyService.feed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chainOfCustodyService.ts src/lib/chainOfCustodyService.feed.test.ts
git commit -m "feat(custody): add tenant-wide fetchCustodyFeed reader"
```

### Task 2: `AuditCustodyFeed` component + scope toggle in AuditTrails

**Files:**
- Create: `src/components/cases/AuditCustodyFeed.tsx`
- Modify: `src/pages/admin/AuditTrails.tsx`
- Test: `src/components/cases/AuditCustodyFeed.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/chainOfCustodyService', () => ({
  fetchCustodyFeed: vi.fn(async () => ({
    rows: [{ id: 'c1', case_id: 'k1', device_id: 'd1', action: 'DEVICE_CHECKED_OUT',
             action_category: 'transfer', description: 'Device released to MARCELO',
             actor_name: 'Tech A', custody_status: 'checked_out',
             created_at: '2026-06-19T00:00:00Z', case_no: 'C-0032' }],
    total: 1,
  })),
}));
vi.mock('../../contexts/TenantConfigContext', () => ({ useDateTimeConfig: () => ({}) }));

import { AuditCustodyFeed } from './AuditCustodyFeed';

it('renders a custody event with its case number and actor', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><AuditCustodyFeed page={0} onPageChange={vi.fn()} search="" /></MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText('C-0032')).toBeInTheDocument();
  expect(screen.getByText(/Device released to MARCELO/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/cases/AuditCustodyFeed.test.tsx`
Expected: FAIL — cannot resolve `./AuditCustodyFeed`.

- [ ] **Step 3: Implement `AuditCustodyFeed`**

```tsx
import React from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchCustodyFeed } from '../../lib/chainOfCustodyService';
import { formatDateTimeWithConfig } from '../../lib/format';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { formatActionType } from '../../lib/chainOfCustodyService';
import { Badge } from '../ui/Badge';

const PAGE_SIZE = 50;

interface Props { page: number; onPageChange: (p: number) => void; search: string; }

export const AuditCustodyFeed: React.FC<Props> = ({ page, search }) => {
  const dt = useDateTimeConfig();
  const { data } = useQuery({
    queryKey: ['custody_feed', search, page],
    queryFn: () => fetchCustodyFeed({ page, pageSize: PAGE_SIZE, search: search || undefined }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.rows ?? [];
  return (
    <div className="divide-y divide-slate-200">
      {rows.map((r) => (
        <div key={r.id} className="p-4 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="info">{formatActionType(r.action)}</Badge>
            {r.case_no && (
              <Link to={`/cases/${r.case_id}`} className="text-sm font-medium text-primary">{r.case_no}</Link>
            )}
            <span className="text-sm text-slate-600">{r.actor_name ?? 'System'}</span>
            <span className="text-xs text-slate-400 ml-auto">{formatDateTimeWithConfig(r.created_at, dt)}</span>
          </div>
          {r.description && <p className="text-sm text-slate-600 break-words">{r.description}</p>}
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/cases/AuditCustodyFeed.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire a scope toggle into `AuditTrails.tsx`**

In `src/pages/admin/AuditTrails.tsx`: add `const [scope, setScope] = useState<'system' | 'custody'>('system');` near the other state (after line 44). Import the component: `import { AuditCustodyFeed } from '../../components/cases/AuditCustodyFeed';`. Prepend a two-button segmented control to the `toolbar` JSX (before the search `div`, line ~120):

```tsx
<div className="flex gap-2">
  <Button variant={scope === 'system' ? 'primary' : 'secondary'} onClick={() => setScope('system')} className="text-sm">System</Button>
  <Button variant={scope === 'custody' ? 'primary' : 'secondary'} onClick={() => setScope('custody')} className="text-sm">Case Custody</Button>
</div>
```

Replace the `table={table}` prop on `ListPageTemplate` (line 202) with:
```tsx
table={scope === 'custody' ? <AuditCustodyFeed page={page} onPageChange={setPage} search={debouncedSearch} /> : table}
```
Gate the existing `audit_trails` query with `enabled: scope === 'system'` (add to the `useQuery` options at line 98) so the system feed doesn't fetch while in custody mode.

- [ ] **Step 6: Verify gates**

Run: `npm run typecheck && npx vitest run src/components/cases/AuditCustodyFeed.test.tsx src/pages/admin`
Expected: 0 type errors; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/cases/AuditCustodyFeed.tsx src/components/cases/AuditCustodyFeed.test.tsx src/pages/admin/AuditTrails.tsx
git commit -m "feat(custody): surface tenant custody feed in the admin audit log"
```

---

## Phase 2 — Per-device History (G4)

### Task 3: `ChainOfCustodyTab` optional `deviceId` filter

**Files:**
- Modify: `src/components/cases/ChainOfCustodyTab.tsx` (props iface ~line 52; query ~line 135)
- Test: `src/components/cases/ChainOfCustodyTab.device.test.tsx` (create)

- [ ] **Step 1: Read the current component**

Run: read `src/components/cases/ChainOfCustodyTab.tsx` fully — confirm the `ChainOfCustodyTabProps` shape (line 52) and the `useQuery({ queryFn: () => getChainOfCustody(caseId) })` (line 135).

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/chainOfCustodyService', async (orig) => ({
  ...(await orig<typeof import('../../lib/chainOfCustodyService')>()),
  getChainOfCustody: vi.fn(async () => [
    { id: 'e1', deviceId: 'd1', actionType: 'DEVICE_CHECKED_OUT', actionCategory: 'transfer', description: 'A', createdAt: '2026-06-19T00:00:00Z' },
    { id: 'e2', deviceId: 'd2', actionType: 'DEVICE_RECEIVED', actionCategory: 'transfer', description: 'B', createdAt: '2026-06-18T00:00:00Z' },
  ]),
}));
vi.mock('../../contexts/TenantConfigContext', () => ({ useDateTimeConfig: () => ({}) }));

import { ChainOfCustodyTab } from './ChainOfCustodyTab';

it('shows only the named device events when deviceId is set', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChainOfCustodyTab caseId="k1" deviceId="d1" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('A')).toBeInTheDocument();
  expect(screen.queryByText('B')).not.toBeInTheDocument();
});
```

(Adjust the mocked entry field names to the real `ChainOfCustodyEntry` shape after reading the file in Step 1 — keep `deviceId` as the device key the filter uses.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/cases/ChainOfCustodyTab.device.test.tsx`
Expected: FAIL — `deviceId` not accepted / both events render.

- [ ] **Step 4: Implement the filter**

In `ChainOfCustodyTabProps` add `deviceId?: string;`. After the query returns `entries`, derive:
```tsx
const visibleEntries = deviceId ? entries.filter((e) => e.deviceId === deviceId) : entries;
```
and render `visibleEntries` instead of `entries`. (Use the actual device-id field name confirmed in Step 1.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/cases/ChainOfCustodyTab.device.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/cases/ChainOfCustodyTab.tsx src/components/cases/ChainOfCustodyTab.device.test.tsx
git commit -m "feat(custody): per-device filter on ChainOfCustodyTab"
```

### Task 4: Per-device History disclosure in `CaseDevicesTab`

**Files:**
- Modify: `src/components/cases/detail/CaseDevicesTab.tsx`
- Test: covered by the existing tab render test if present; else add a smoke assertion.

- [ ] **Step 1: Read `CaseDevicesTab.tsx`** to find the per-device card markup and the `caseId`/`device.id` in scope.

- [ ] **Step 2: Add a collapsible "History" section per device card.** Add `const [openHistory, setOpenHistory] = useState<string | null>(null);` to the component. In each device card footer:

```tsx
<button
  type="button"
  onClick={() => setOpenHistory((cur) => (cur === device.id ? null : device.id))}
  className="mt-2 flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
  aria-expanded={openHistory === device.id}
>
  <History className="h-4 w-4" /> {openHistory === device.id ? 'Hide history' : 'View history'}
</button>
{openHistory === device.id && (
  <div className="mt-2 rounded-lg border border-slate-200">
    <ChainOfCustodyTab caseId={caseId} deviceId={device.id} />
  </div>
)}
```

Import `History` from `lucide-react` and `ChainOfCustodyTab` from `../ChainOfCustodyTab`.

- [ ] **Step 3: Verify gates**

Run: `npm run typecheck && npx vitest run src/components/cases/detail`
Expected: 0 type errors; existing tests stay green.

- [ ] **Step 4: Commit**

```bash
git add src/components/cases/detail/CaseDevicesTab.tsx
git commit -m "feat(custody): per-device history disclosure on the Devices tab"
```

---

## Phase 3 — Customer Timeline (G3, tenant-staff-only)

### Task 5: Extract shared `ActivityTimeline` (DRY)

**Files:**
- Create: `src/components/shared/ActivityTimeline.tsx`
- Modify: `src/components/cases/detail/CaseActivityTab.tsx` (reuse it)
- Test: `src/components/shared/ActivityTimeline.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('../../contexts/TenantConfigContext', () => ({ useDateTimeConfig: () => ({}) }));
import { ActivityTimeline } from './ActivityTimeline';

it('renders one entry per item with formatted action and actor', () => {
  render(<ActivityTimeline entries={[
    { id: 'e1', action: 'checkout', details: '{"collector_name":"MARCELO"}', old_value: null, new_value: null, created_at: '2026-06-19T00:00:00Z', actor_name: 'Tech A' },
  ]} />);
  expect(screen.getByText(/MARCELO/)).toBeInTheDocument();
  expect(screen.getByText('Tech A', { exact: false })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/shared/ActivityTimeline.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Create `ActivityTimeline.tsx`** by moving the `DetailsBlock` helper and the `<ol className="relative space-y-4 …">` rendering out of `CaseActivityTab.tsx` (lines 22-52 and 120-154) verbatim into a presentational component:

```tsx
export interface ActivityEntry {
  id: string; action: string; details: string | null;
  old_value: string | null; new_value: string | null;
  created_at: string; actor_name: string;
}
export const ActivityTimeline: React.FC<{ entries: ActivityEntry[] }> = ({ entries }) => {
  /* DetailsBlock + the <ol> timeline markup moved here unchanged */
};
```

- [ ] **Step 4: Refactor `CaseActivityTab`** to keep its query and render `<ActivityTimeline entries={entries} />` for the success branch (keep its loading/error/empty states).

- [ ] **Step 5: Run tests** — `npx vitest run src/components/shared/ActivityTimeline.test.tsx src/components/cases/detail` → PASS (CaseActivityTab unchanged behaviorally).

- [ ] **Step 6: Commit** — `git commit -m "refactor(activity): extract shared ActivityTimeline"`

### Task 6: `fetchCustomerTimeline` reader + query key

**Files:**
- Modify: `src/lib/chainOfCustodyService.ts`, `src/lib/queryKeys.ts`
- Test: `src/lib/chainOfCustodyService.timeline.test.ts` (create)

- [ ] **Step 1: Add the query key.** In `src/lib/queryKeys.ts` add:
```ts
export const customerKeys = {
  all: ['customers'] as const,
  timeline: (id: string) => [...customerKeys.all, 'timeline', id] as const,
};
```

- [ ] **Step 2: Write the failing test** (mock `supabase.from` to return cases then job-history then profiles; assert entries carry `actor_name`). Run → FAIL (`fetchCustomerTimeline is not a function`).

- [ ] **Step 3: Implement `fetchCustomerTimeline(customerId)`** in `chainOfCustodyService.ts`:

```ts
import type { ActivityEntry } from '../components/shared/ActivityTimeline';

export async function fetchCustomerTimeline(customerId: string): Promise<ActivityEntry[]> {
  const { data: cases } = await supabase
    .from('cases').select('id').eq('customer_id', customerId).is('deleted_at', null);
  const caseIds = (cases ?? []).map((c) => c.id);
  if (caseIds.length === 0) return [];
  const { data, error } = await supabase
    .from('case_job_history')
    .select('id, action, details, old_value, new_value, performed_by, created_at')
    .in('case_id', caseIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => r.performed_by).filter(Boolean))] as string[];
  const names = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name);
  }
  return rows.map((r) => ({
    ...r,
    actor_name: r.performed_by ? names.get(r.performed_by) ?? 'Unknown user' : 'System',
  }));
}
```

- [ ] **Step 4: Run test** → PASS. **Step 5: Commit** — `git commit -m "feat(custody): fetchCustomerTimeline reader"`.

### Task 7: `CustomerTimelineTab` + register the tab

**Files:**
- Create: `src/components/customers/CustomerTimelineTab.tsx`
- Modify: `src/pages/customers/CustomerProfilePage.tsx` (TabId line 38; tabs array 991-995; render after line 1065)
- Test: `src/components/customers/CustomerTimelineTab.test.tsx` (create)

- [ ] **Step 1: Write the failing test** (mock `fetchCustomerTimeline` → one entry; render inside `QueryClientProvider`; assert the entry text appears, and the empty-state copy when `[]`).

- [ ] **Step 2: Run → FAIL** (module missing).

- [ ] **Step 3: Implement `CustomerTimelineTab`:**

```tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { fetchCustomerTimeline } from '../../lib/chainOfCustodyService';
import { customerKeys } from '../../lib/queryKeys';
import { ActivityTimeline } from '../shared/ActivityTimeline';
import { Skeleton } from '../ui/Skeleton';

export const CustomerTimelineTab: React.FC<{ customerId: string }> = ({ customerId }) => {
  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: customerKeys.timeline(customerId),
    queryFn: () => fetchCustomerTimeline(customerId),
  });
  if (isLoading) return <div className="space-y-3 p-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>;
  if (isError) return <div className="p-6 text-center text-sm text-danger" role="alert">Couldn't load timeline.</div>;
  if (entries.length === 0) return (
    <div className="py-12 text-center">
      <Activity className="mx-auto mb-4 h-16 w-16 text-slate-300" />
      <p className="text-sm text-slate-500">No activity recorded for this customer yet.</p>
    </div>
  );
  return <ActivityTimeline entries={entries} />;
};
```

- [ ] **Step 4: Register the tab** in `CustomerProfilePage.tsx`:
  - Line 38: `type TabId = 'overview' | 'cases' | 'financial' | 'communications' | 'purchases' | 'timeline';`
  - Import `Activity` from `lucide-react` and `CustomerTimelineTab`.
  - tabs array (after line 995): `{ id: 'timeline', label: 'Timeline', icon: Activity },`
  - render (after line 1065): `{activeTab === 'timeline' && id && <CustomerTimelineTab customerId={id} />}`

- [ ] **Step 5: Run tests + gates** — `npm run typecheck && npx vitest run src/components/customers src/pages/customers` → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(custody): customer activity timeline tab"`.

---

## Final gate (after all phases)

- [ ] `npm run typecheck` → 0 errors
- [ ] `npx eslint <all touched files>` → 0 errors (pre-existing `no-untranslated-jsx-text` warnings accepted)
- [ ] `npx vitest run` → full suite green
- [ ] `npm run check:tokens` → OK
- [ ] `npm run build` → clean

## Self-review notes
- **Spec coverage:** G2 (Task 1-2), G4 (Task 3-4), G3 (Task 5-7). G1/G5/G6/G7 are Workstream B; G8 is C3 — out of scope here.
- **No schema change** — all three surfaces read existing tables; tenant RLS enforces isolation.
- **Type consistency:** `ActivityEntry` is defined once in `ActivityTimeline.tsx` and imported by `fetchCustomerTimeline` + `CustomerTimelineTab` + `CaseActivityTab`. `CustodyFeedRow` is defined once in `chainOfCustodyService.ts`.
- **Decisions honored:** Customer Timeline is tenant-staff-only (CustomerProfilePage, not portal).
