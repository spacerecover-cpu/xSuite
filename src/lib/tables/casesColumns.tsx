import { Badge } from '../../components/ui/Badge';
import { formatDate } from '../format';
import type { TableColumnDef } from './types';

/** Display-ready row for the cases list — colors and the primary device are
 *  resolved by the page before rendering so column renders stay pure. */
export interface CaseListRow {
  id: string;
  case_no: string;
  priority: string;
  priority_color: string;
  status: string;
  status_name: string;
  status_color: string;
  customer_name: string | null;
  customer_mobile: string | null;
  client_reference: string | null;
  created_at: string;
  created_by_name: string | null;
  device_type: string | null;
  device_model: string | null;
  device_brand: string | null;
  device_capacity: string | null;
  serial_primary: string | null;
  device_count: number;
}

const dash = <span className="text-slate-400">-</span>;

export const CASES_TABLE_KEY = 'cases';

/** The "primary" patient device drives the device columns; fall back to the
 *  first device (legacy rows predate the is_primary flag). */
export function pickPrimaryDevice<D extends { is_primary?: boolean | null }>(
  devices: D[] | null | undefined,
): D | undefined {
  if (!devices || devices.length === 0) return undefined;
  return devices.find((d) => d.is_primary) ?? devices[0];
}

export const casesColumns: TableColumnDef<CaseListRow>[] = [
  {
    key: 'case_no',
    label: 'Case ID',
    minWidth: 110,
    priority: 1,
    defaultVisible: true,
    render: (r) => <span className="font-semibold text-primary">{r.case_no}</span>,
    exportValue: (r) => r.case_no,
  },
  {
    key: 'priority',
    label: 'Priority',
    minWidth: 100,
    priority: 2,
    defaultVisible: true,
    render: (r) => (
      <Badge variant="custom" color={r.priority_color} size="sm">
        {r.priority}
      </Badge>
    ),
    exportValue: (r) => r.priority,
  },
  {
    key: 'customer',
    label: 'Customer',
    minWidth: 170,
    priority: 1,
    defaultVisible: true,
    render: (r) =>
      r.customer_name ? <span className="font-medium text-slate-900">{r.customer_name}</span> : dash,
    exportValue: (r) => r.customer_name,
  },
  {
    key: 'contact_number',
    label: 'Contact Number',
    minWidth: 140,
    priority: 4,
    defaultVisible: true,
    render: (r) =>
      r.customer_mobile ? (
        <span className="text-sm tabular-nums text-slate-700">{r.customer_mobile}</span>
      ) : (
        dash
      ),
    exportValue: (r) => r.customer_mobile,
  },
  {
    key: 'client_ref',
    label: 'Client Ref',
    minWidth: 110,
    priority: 5,
    defaultVisible: true,
    render: (r) =>
      r.client_reference ? <span className="text-sm text-slate-700">{r.client_reference}</span> : dash,
    exportValue: (r) => r.client_reference,
  },
  {
    key: 'status',
    label: 'Status',
    minWidth: 150,
    priority: 1,
    defaultVisible: true,
    render: (r) => (
      <Badge variant="custom" color={r.status_color} size="sm">
        {r.status_name}
      </Badge>
    ),
    exportValue: (r) => r.status,
  },
  {
    key: 'device_type',
    label: 'Device Type',
    minWidth: 120,
    priority: 3,
    defaultVisible: true,
    render: (r) => (r.device_type ? <span className="text-sm text-slate-700">{r.device_type}</span> : dash),
    exportValue: (r) => r.device_type,
  },
  {
    key: 'device_model',
    label: 'Device Model',
    minWidth: 140,
    priority: 4,
    defaultVisible: false,
    render: (r) =>
      r.device_model ? (
        <span className="block max-w-[12rem] truncate text-sm text-slate-700" title={r.device_model}>
          {r.device_model}
        </span>
      ) : (
        dash
      ),
    exportValue: (r) => r.device_model,
  },
  {
    key: 'device_brand',
    label: 'Brand',
    minWidth: 110,
    priority: 6,
    defaultVisible: false,
    render: (r) => (r.device_brand ? <span className="text-sm text-slate-700">{r.device_brand}</span> : dash),
    exportValue: (r) => r.device_brand,
  },
  {
    key: 'serial_primary',
    label: 'Serial Number',
    minWidth: 160,
    priority: 3,
    defaultVisible: true,
    render: (r) =>
      r.serial_primary ? (
        <span className="text-sm tabular-nums text-slate-700" title={r.device_count > 1 ? `Primary device of ${r.device_count}` : undefined}>
          {r.serial_primary}
          {r.device_count > 1 ? <span className="ml-1 text-xs text-slate-400">+{r.device_count - 1}</span> : null}
        </span>
      ) : (
        dash
      ),
    exportValue: (r) => r.serial_primary,
  },
  {
    key: 'capacity',
    label: 'Capacity',
    minWidth: 100,
    priority: 5,
    defaultVisible: false,
    render: (r) =>
      r.device_capacity ? <span className="text-sm tabular-nums text-slate-700">{r.device_capacity}</span> : dash,
    exportValue: (r) => r.device_capacity,
  },
  {
    key: 'created_at',
    label: 'Created At',
    minWidth: 115,
    priority: 2,
    defaultVisible: true,
    render: (r) => <span className="text-sm text-slate-600">{formatDate(r.created_at)}</span>,
    exportValue: (r) => (r.created_at ? r.created_at.slice(0, 10) : ''),
  },
  {
    key: 'created_by',
    label: 'Created By',
    minWidth: 130,
    priority: 6,
    defaultVisible: false,
    render: (r) => (r.created_by_name ? <span className="text-sm text-slate-700">{r.created_by_name}</span> : dash),
    exportValue: (r) => r.created_by_name,
  },
];

export const casesRegistryMeta = casesColumns.map(({ key, defaultVisible }) => ({ key, defaultVisible }));
