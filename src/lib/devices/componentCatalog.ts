// src/lib/devices/componentCatalog.ts
// Static presentation metadata + status helpers for the Components tab. Component
// statuses live in device_diagnostics.result.{componentKey}_status as a
// catalog_device_component_statuses name; these helpers normalize that free-text
// status into a small bucket the overview/list/badges render against.
import {
  AudioLines, CircuitBoard, Fan, Disc3, DatabaseZap, Cpu, MemoryStick, Component,
  CheckCircle2, AlertTriangle, XCircle, CircleDashed, type LucideIcon,
} from 'lucide-react';
import type { BadgeVariant } from '../ui/variants';
import type { StatCardTone } from '../../components/shared/StatCard';

export interface ComponentCatalogEntry {
  icon: LucideIcon;
  subtitle: string;
  description: string;
}

/** componentKey → header presentation. Falls back to FALLBACK for unknown keys. */
export const COMPONENT_CATALOG: Record<string, ComponentCatalogEntry> = {
  heads: { icon: AudioLines, subtitle: 'Read/Write Heads Assembly', description: 'Responsible for reading and writing data on disk platters' },
  pcb: { icon: CircuitBoard, subtitle: 'Printed Circuit Board', description: 'Controls power delivery and data flow to the drive' },
  motor: { icon: Fan, subtitle: 'Spindle Motor', description: 'Spins the platters up to operating speed' },
  surface: { icon: Disc3, subtitle: 'Read/Write Surface', description: 'Magnetic platter surface where data is stored' },
  service_area: { icon: DatabaseZap, subtitle: 'Service Area (SA)', description: 'Firmware modules and adaptive data held on the platters' },
  controller: { icon: Cpu, subtitle: 'Controller', description: 'Manages flash memory and host communication' },
  memory_chips: { icon: MemoryStick, subtitle: 'NAND / Memory Chips', description: 'Non-volatile memory where the data resides' },
  storage_chip: { icon: MemoryStick, subtitle: 'Storage Chip', description: 'Embedded storage memory on the board' },
};

export const FALLBACK_COMPONENT: ComponentCatalogEntry = {
  icon: Component, subtitle: 'Component', description: 'Device component under inspection',
};

export function componentEntry(componentKey: string): ComponentCatalogEntry {
  return COMPONENT_CATALOG[componentKey] ?? FALLBACK_COMPONENT;
}

export type StatusBucket = 'good' | 'attention' | 'failed' | 'not_tested';

/** Normalize a component-status name into one of four buckets (robust to wording). */
export function statusBucket(name: string | null | undefined): StatusBucket {
  const s = (name ?? '').trim().toLowerCase();
  if (!s) return 'not_tested';
  if (/fail|bad|dead|damaged|short|burn|broken/.test(s)) return 'failed';
  if (/attention|partial|warn|degrad|replace|weak|marginal|mismatch/.test(s)) return 'attention';
  if (/good|pass|ok|normal|healthy|working|fine/.test(s)) return 'good';
  return 'not_tested';
}

export const BUCKET_LABEL: Record<StatusBucket, string> = {
  good: 'Good', attention: 'Attention', failed: 'Failed', not_tested: 'Not Tested',
};

export const BUCKET_BADGE: Record<StatusBucket, BadgeVariant> = {
  good: 'success', attention: 'warning', failed: 'danger', not_tested: 'secondary',
};

export const BUCKET_TONE: Record<StatusBucket, StatCardTone> = {
  good: 'success', attention: 'warning', failed: 'danger', not_tested: 'neutral',
};

export const BUCKET_ICON: Record<StatusBucket, LucideIcon> = {
  good: CheckCircle2, attention: AlertTriangle, failed: XCircle, not_tested: CircleDashed,
};

export const STATUS_BUCKETS: StatusBucket[] = ['good', 'attention', 'failed', 'not_tested'];

/** Options for the per-component Result select (Diagnostic Summary). */
export const COMPONENT_RESULT_OPTIONS = ['Pass', 'Fail', 'Inconclusive', 'Pending'].map((n) => ({ id: n, name: n }));
