// ─────────────────────────────────────────────────────────────────────────────
// Tenant Feature Registry — the single source of truth for every per-tenant
// toggleable surface. Tenants store only OVERRIDES (in tenants.feature_flags);
// this registry holds the defaults, metadata, dependencies, and the binding of
// each feature key to the surface that consumes it.
//
// This is DISTINCT from subscription/plan entitlements (src/lib/featureGateService.ts
// + useFeature in useFeatureGate.ts), which gate by what a tenant has PAID for.
// This registry gates by what a tenant CHOSE to enable for their workflow.
//
// Adding a new toggle = add one entry here + read isFeatureEnabled at the surface.
// No migration, no schema change.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveFeatureEnabled, type ResolvableFeature } from './resolveFeatures';

export type FeatureCategory =
  | 'case_tabs'
  | 'workflow'
  | 'navigation'
  | 'dashboard'
  | 'portal'
  | 'automation';

export interface FeatureDef extends ResolvableFeature {
  key: string;
  label: string;
  description: string;
  category: FeatureCategory;
  defaultEnabled: boolean;
  /** Core features are always on and are shown read-only in Settings. */
  core?: boolean;
  dependsOn?: string[];
  // ── Surface bindings (read by the enforcement points) ──
  /** Matches a tab id in CaseDetail.tsx. */
  caseTabId?: string;
  /** A case-status phase whose pipeline chip this toggle shows/hides (display only). */
  stagePhase?: string;
  /** Routes a FeatureRoute guard should block when this feature is off. */
  routes?: string[];
}

export const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  case_tabs: 'Case Tabs',
  workflow: 'Workflow Stages',
  navigation: 'Navigation & Modules',
  dashboard: 'Dashboard Widgets',
  portal: 'Customer Portal',
  automation: 'Automation',
};

export const FEATURE_REGISTRY: FeatureDef[] = [
  // ── Case detail tabs ── (ids must match CaseDetail.tsx `tabs`)
  { key: 'case.tab.overview', label: 'Overview', description: 'Case summary tab.', category: 'case_tabs', defaultEnabled: true, core: true, caseTabId: 'overview' },
  { key: 'case.tab.client', label: 'Client', description: 'Client information tab.', category: 'case_tabs', defaultEnabled: true, core: true, caseTabId: 'client' },
  { key: 'case.tab.devices', label: 'Devices', description: 'Devices on the case.', category: 'case_tabs', defaultEnabled: true, core: true, caseTabId: 'devices' },
  { key: 'case.tab.clones', label: 'Clone Drives', description: 'Clone/imaging drive management.', category: 'case_tabs', defaultEnabled: true, caseTabId: 'clones' },
  { key: 'case.tab.documents', label: 'Reports', description: 'Case documents & report generation.', category: 'case_tabs', defaultEnabled: true, caseTabId: 'documents' },
  { key: 'case.tab.quotes', label: 'Quotes / Invoices', description: 'Quotes and invoices in case context.', category: 'case_tabs', defaultEnabled: true, caseTabId: 'quotes' },
  { key: 'case.tab.stock', label: 'Backup Devices', description: 'Backup/stock device handling for the case.', category: 'case_tabs', defaultEnabled: true, caseTabId: 'stock' },
  { key: 'case.tab.files', label: 'Files', description: 'File attachments.', category: 'case_tabs', defaultEnabled: true, caseTabId: 'files' },
  { key: 'case.tab.engineers', label: 'Engineers', description: 'Engineer assignment.', category: 'case_tabs', defaultEnabled: true, caseTabId: 'engineers' },
  { key: 'case.tab.recovery_qa', label: 'Recovery & QA', description: 'Recovery progress and QA sign-off.', category: 'case_tabs', defaultEnabled: true, caseTabId: 'recovery_qa' },
  { key: 'case.tab.notes', label: 'Internal Notes', description: 'Internal-only notes & findings.', category: 'case_tabs', defaultEnabled: true, caseTabId: 'notes' },
  { key: 'case.tab.communications', label: 'Communications', description: 'Case communication log & compose (email / WhatsApp / SMS).', category: 'case_tabs', defaultEnabled: true, caseTabId: 'communications' },
  { key: 'case.tab.portal', label: 'Client Portal (case)', description: "Per-case portal visibility settings.", category: 'case_tabs', defaultEnabled: true, caseTabId: 'portal' },
  { key: 'case.tab.history', label: 'Device Tracking', description: 'Chain-of-custody / device tracking history.', category: 'case_tabs', defaultEnabled: true, caseTabId: 'history' },

  // ── Workflow stages ── (display-only filtering of the Stage Banner pipeline)
  { key: 'workflow.stage_banner', label: 'Stage Banner', description: 'The CURRENT STAGE banner and lifecycle pipeline on the case page.', category: 'workflow', defaultEnabled: true },
  { key: 'workflow.stage.quoting', label: 'Stage: Quoting', description: 'Show the Quoting stage in the pipeline.', category: 'workflow', defaultEnabled: true, dependsOn: ['workflow.stage_banner'], stagePhase: 'quoting' },
  { key: 'workflow.stage.awaiting_approval', label: 'Stage: Awaiting Approval', description: 'Show the Awaiting Approval stage in the pipeline.', category: 'workflow', defaultEnabled: true, dependsOn: ['workflow.stage_banner'], stagePhase: 'awaiting_approval' },
  { key: 'workflow.stage.qa', label: 'Stage: QA', description: 'Show the QA stage in the pipeline.', category: 'workflow', defaultEnabled: true, dependsOn: ['workflow.stage_banner'], stagePhase: 'qa' },

  // ── Navigation / modules ── (AND-ed with role hasModuleAccess at the sidebar)
  { key: 'nav.financial', label: 'Financial', description: 'Invoices, payments, expenses, banking navigation.', category: 'navigation', defaultEnabled: true },
  { key: 'nav.business', label: 'Business', description: 'Customers, companies, suppliers navigation.', category: 'navigation', defaultEnabled: true },
  { key: 'nav.resources', label: 'Lab & Resources', description: 'Inventory, stock, clone drives, tools navigation.', category: 'navigation', defaultEnabled: true },
  { key: 'nav.hr', label: 'HR & Payroll', description: 'HR, payroll, attendance navigation.', category: 'navigation', defaultEnabled: true },

  // ── Dashboard widgets ──
  { key: 'dashboard.cases_overview', label: 'Cases Overview', description: 'Top dashboard case stat cards.', category: 'dashboard', defaultEnabled: true },
  { key: 'dashboard.stock_widgets', label: 'Stock & Inventory Widgets', description: 'Low stock, sales, and stock-value widgets.', category: 'dashboard', defaultEnabled: true },
  { key: 'dashboard.quick_nav', label: 'Quick Navigation Cards', description: 'Dashboard shortcut cards.', category: 'dashboard', defaultEnabled: true },

  // ── Customer Portal ── (also enforced server-side via tenant_feature_enabled)
  { key: 'portal.customer', label: 'Customer Portal', description: 'The external customer portal (login + all portal pages).', category: 'portal', defaultEnabled: true, routes: ['/portal'] },

  // ── Automation ── (nascent; only the follow-up surface exists today)
  { key: 'automation.case_follow_ups', label: 'Case Follow-ups', description: 'Scheduled case follow-up reminders.', category: 'automation', defaultEnabled: true },
];

export const FEATURES_BY_KEY: Record<string, FeatureDef> = Object.fromEntries(
  FEATURE_REGISTRY.map((f) => [f.key, f]),
);

/** Maps a CaseDetail tab id → its feature key (only tabs that have one). */
export const CASE_TAB_FEATURE: Record<string, string> = Object.fromEntries(
  FEATURE_REGISTRY.filter((f) => f.caseTabId).map((f) => [f.caseTabId as string, f.key]),
);

/** Maps a case-status phase → the feature key that toggles its pipeline chip. */
export const STAGE_FEATURE_BY_PHASE: Record<string, string> = Object.fromEntries(
  FEATURE_REGISTRY.filter((f) => f.stagePhase).map((f) => [f.stagePhase as string, f.key]),
);

export function featuresByCategory(): Record<FeatureCategory, FeatureDef[]> {
  const out = {} as Record<FeatureCategory, FeatureDef[]>;
  for (const f of FEATURE_REGISTRY) {
    (out[f.category] ||= []).push(f);
  }
  return out;
}

/** App-facing resolver bound to the real registry. */
export function isFeatureEnabled(
  flags: Record<string, boolean> | null | undefined,
  key: string,
): boolean {
  return resolveFeatureEnabled(FEATURES_BY_KEY, flags, key);
}
