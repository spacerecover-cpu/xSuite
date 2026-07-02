// Case lifecycle classification for the Cases command center.
//
// The canonical taxonomy is master_case_statuses.type (11 values, global
// vocabulary). Tenants with imported legacy status names carry per-name
// overrides in company_settings.metadata.case_status_types — layered over the
// master rows here so the global vocabulary never absorbs tenant-specific
// strings. Everything in this module is pure and unit-tested.

export const CASE_STATUS_TYPES = [
  'intake',
  'diagnosis',
  'quoting',
  'awaiting_approval',
  'approved',
  'recovery',
  'qa',
  'ready',
  'completed',
  'delivered',
  'cancelled',
] as const;

export type CaseStatusType = (typeof CASE_STATUS_TYPES)[number];

/** Operator-facing labels for the lifecycle types (settings UI, tooltips). */
export const STATUS_TYPE_LABELS: Record<CaseStatusType, string> = {
  intake: 'New / intake',
  diagnosis: 'Diagnosis',
  quoting: 'Quoting',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved (queued)',
  recovery: 'Recovery',
  qa: 'QA / verification',
  ready: 'Ready',
  completed: 'Completed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Types that end the pipeline — never age-flagged, excluded from "active". */
export const TERMINAL_TYPES: readonly CaseStatusType[] = ['completed', 'delivered', 'cancelled'];

/** Disjoint pipeline buckets shown as command-center cards. */
export type CaseBucket = 'new' | 'diagnosis' | 'approval' | 'recovery' | 'ready' | 'delivered';

export const CASE_BUCKET_TYPES: Record<CaseBucket, readonly CaseStatusType[]> = {
  new: ['intake'],
  diagnosis: ['diagnosis'],
  approval: ['quoting', 'awaiting_approval'],
  recovery: ['approved', 'recovery', 'qa'],
  ready: ['ready'],
  delivered: ['completed', 'delivered'],
};

export const CASE_BUCKETS = Object.keys(CASE_BUCKET_TYPES) as CaseBucket[];

export interface MasterStatusRow {
  name: string;
  type: string | null;
}

export interface CaseStatusCount {
  status: string | null;
  total: number;
}

function isStatusType(value: unknown): value is CaseStatusType {
  return typeof value === 'string' && (CASE_STATUS_TYPES as readonly string[]).includes(value);
}

/** Master rows first, tenant overrides win; invalid override values dropped. */
export function resolveStatusTypes(
  master: MasterStatusRow[],
  overrides: Record<string, string> | undefined,
): Map<string, CaseStatusType> {
  const map = new Map<string, CaseStatusType>();
  for (const row of master) {
    if (isStatusType(row.type)) map.set(row.name, row.type);
  }
  for (const [name, type] of Object.entries(overrides ?? {})) {
    if (isStatusType(type)) map.set(name, type);
  }
  return map;
}

export interface BucketizedCounts {
  buckets: Record<CaseBucket, number>;
  cancelled: number;
  /** Statuses (incl. null) with no lifecycle classification — treated as open. */
  unmapped: number;
  total: number;
  /** Everything not delivered/completed/cancelled; unmapped counts as active. */
  active: number;
}

const typeToBucket: Partial<Record<CaseStatusType, CaseBucket>> = {};
for (const bucket of CASE_BUCKETS) {
  for (const type of CASE_BUCKET_TYPES[bucket]) typeToBucket[type] = bucket;
}

export function bucketizeStatusCounts(
  counts: CaseStatusCount[],
  typeMap: Map<string, CaseStatusType>,
): BucketizedCounts {
  const buckets: Record<CaseBucket, number> = {
    new: 0,
    diagnosis: 0,
    approval: 0,
    recovery: 0,
    ready: 0,
    delivered: 0,
  };
  let cancelled = 0;
  let unmapped = 0;
  let total = 0;

  for (const { status, total: n } of counts) {
    total += n;
    const type = status !== null ? typeMap.get(status) : undefined;
    if (!type) {
      unmapped += n;
      continue;
    }
    if (type === 'cancelled') {
      cancelled += n;
      continue;
    }
    const bucket = typeToBucket[type];
    if (bucket) buckets[bucket] += n;
  }

  return {
    buckets,
    cancelled,
    unmapped,
    total,
    active: total - buckets.delivered - cancelled,
  };
}

/** Data-present status names whose type belongs to the bucket (drives .in() filters). */
export function statusNamesForBucket(
  bucket: CaseBucket,
  counts: CaseStatusCount[],
  typeMap: Map<string, CaseStatusType>,
): string[] {
  const types = CASE_BUCKET_TYPES[bucket];
  const names: string[] = [];
  for (const { status } of counts) {
    if (status === null) continue;
    const type = typeMap.get(status);
    if (type && types.includes(type)) names.push(status);
  }
  return names;
}

export function ageDays(createdAt: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86400000);
}

/** Compact operator-facing age: '<1h', 'Nh' under a day, then 'Nd'. */
export function formatCaseAge(createdAt: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(createdAt).getTime());
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export const AGE_WARN_DAYS = 5;
export const AGE_CRIT_DAYS = 10;

export type AgeSeverity = 'ok' | 'warn' | 'crit';

/**
 * SLA coloring for the Age column. Terminal cases are never flagged; an
 * unknown lifecycle type is treated as open (honest for unclassified statuses).
 */
export function ageSeverity(
  createdAt: string,
  now: Date,
  lifecycleType: CaseStatusType | null,
): AgeSeverity {
  if (lifecycleType && TERMINAL_TYPES.includes(lifecycleType)) return 'ok';
  const days = ageDays(createdAt, now);
  if (days >= AGE_CRIT_DAYS) return 'crit';
  if (days >= AGE_WARN_DAYS) return 'warn';
  return 'ok';
}
