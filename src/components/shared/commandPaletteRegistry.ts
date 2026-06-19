import { Bell, Shield, Settings, ShoppingCart, Plus, UserPlus, type LucideIcon } from 'lucide-react';
import { NAV_SECTIONS, type NavGateContext } from '../layout/navConfig';
import { getModuleKeyForRoute } from '../../lib/moduleMapping';

export type CommandKind = 'page' | 'action' | 'recent';

export interface CommandItem {
  id: string;
  kind: CommandKind;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  to: string;
  keywords?: string;
}

// Search keywords that improved matching on certain nav items — preserved from
// the previous static list and re-applied to the NAV_SECTIONS-derived commands.
const NAV_KEYWORDS: Record<string, string> = {
  '/': 'home overview',
  '/cases': 'jobs work tickets',
  '/case-reports': 'reports',
  '/customers': 'clients contacts',
  '/companies': 'organizations businesses',
  '/quotes': 'proforma estimates',
  '/invoices': 'billing',
  '/payments': 'receipts paid',
  '/transactions': 'ledger',
  '/banking': 'bank accounts reconciliation',
  '/vat-audit': 'tax compliance',
  '/finance': 'kpi metrics revenue',
  '/reports': 'financial analytics',
  '/tools': 'parts donors inventory',
  '/stock': 'devices items pos',
  '/clone-drives': 'donor imaging',
  '/procedures': 'knowledge base articles kb',
  '/purchase-orders': 'po',
};

// Palette-only commands that aren't in the sidebar nav. Each carries an explicit
// gate (routes like /stock/sales, /admin/audit, /settings/* have no module map).
interface GatedExtra {
  item: CommandItem;
  show: (ctx: NavGateContext) => boolean;
}

const EXTRA_COMMANDS: GatedExtra[] = [
  // Personal / global pages — available to any authenticated user.
  { item: { id: 'nav-notifications', kind: 'page', group: 'System', label: 'Notifications', icon: Bell, to: '/notifications', keywords: 'history inbox alerts' }, show: () => true },
  { item: { id: 'nav-notif-prefs', kind: 'page', group: 'System', label: 'Notification Preferences', icon: Bell, to: '/settings/notifications' }, show: () => true },
  { item: { id: 'nav-security', kind: 'page', group: 'System', label: 'Security', icon: Shield, to: '/settings/security' }, show: () => true },
  { item: { id: 'nav-appearance', kind: 'page', group: 'System', label: 'Appearance', icon: Settings, to: '/settings/appearance', keywords: 'theme color' }, show: () => true },
  // Module / admin gated.
  { item: { id: 'nav-stock-sales', kind: 'page', group: 'Resources', label: 'Stock Sales', icon: ShoppingCart, to: '/stock/sales' }, show: (c) => c.hasModuleAccess('stock') },
  { item: { id: 'nav-audit', kind: 'page', group: 'System', label: 'Audit Trails', icon: Shield, to: '/admin/audit' }, show: (c) => c.isAdmin },
];

// Quick-create actions — navigate with ?new=1; gated by the target module.
const CREATE_ACTIONS: { item: CommandItem; module: string }[] = [
  { item: { id: 'act-new-case', kind: 'action', group: 'Create', label: 'New Case', hint: 'Open case create modal', icon: Plus, to: '/cases?new=1', keywords: 'create job' }, module: 'cases' },
  { item: { id: 'act-new-customer', kind: 'action', group: 'Create', label: 'New Customer', icon: UserPlus, to: '/customers?new=1', keywords: 'create client' }, module: 'customers' },
  { item: { id: 'act-new-invoice', kind: 'action', group: 'Create', label: 'New Invoice', icon: Plus, to: '/invoices?new=1', keywords: 'create bill' }, module: 'invoices' },
  { item: { id: 'act-new-quote', kind: 'action', group: 'Create', label: 'New Quote', icon: Plus, to: '/quotes?new=1', keywords: 'create proforma' }, module: 'quotes' },
  { item: { id: 'act-new-payment', kind: 'action', group: 'Create', label: 'Record Payment', icon: Plus, to: '/payments?new=1' }, module: 'payments' },
  { item: { id: 'act-new-expense', kind: 'action', group: 'Create', label: 'New Expense', icon: Plus, to: '/expenses?new=1' }, module: 'expenses' },
  { item: { id: 'act-new-supplier', kind: 'action', group: 'Create', label: 'New Supplier', icon: Plus, to: '/suppliers?new=1' }, module: 'suppliers' },
  { item: { id: 'act-new-po', kind: 'action', group: 'Create', label: 'New Purchase Order', icon: Plus, to: '/purchase-orders?new=1', keywords: 'po' }, module: 'suppliers' },
];

/**
 * Build the gated command-palette registry for the current user. The nav pages
 * are derived from NAV_SECTIONS and gated EXACTLY like the sidebar (section
 * feature/module gate + per-item `hasModuleAccess(getModuleKeyForRoute(to))`),
 * so the palette never exposes navigation the sidebar hides. Palette-only extras
 * and quick-create actions carry their own explicit gates. Pure + testable.
 */
export function buildCommands(ctx: NavGateContext): CommandItem[] {
  const cmds: CommandItem[] = [];

  // 1. Sidebar nav — single source of truth, same gating as the sidebar.
  for (const section of NAV_SECTIONS) {
    if (section.gate && !section.gate(ctx)) continue;
    for (const item of section.items) {
      const key = item.moduleKey ?? getModuleKeyForRoute(item.to);
      if (!key || !ctx.hasModuleAccess(key)) continue;
      cmds.push({
        id: `nav-${item.to}`,
        kind: 'page',
        group: section.title,
        label: item.label,
        icon: item.icon,
        to: item.to,
        keywords: NAV_KEYWORDS[item.to],
      });
    }
  }

  // 2. Palette-only extras (explicit gates).
  for (const extra of EXTRA_COMMANDS) {
    if (extra.show(ctx)) cmds.push(extra.item);
  }

  // 3. Quick-create actions (gated by target module).
  for (const action of CREATE_ACTIONS) {
    if (ctx.hasModuleAccess(action.module)) cmds.push(action.item);
  }

  return cmds;
}
