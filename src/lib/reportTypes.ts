import {
  FileText,
  Wrench,
  Server,
  Shield,
  Scale,
  Trash2,
  AlertTriangle,
  Files,
  LucideIcon,
} from 'lucide-react';

export type ReportType =
  | 'evaluation'
  | 'service'
  | 'server'
  | 'malware'
  | 'forensic'
  | 'data_destruction'
  | 'prevention'
  | 'recovered_files';

export type ReportStatus = 'draft' | 'review' | 'approved' | 'sent';

export interface ReportTypeConfig {
  key: ReportType;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  badgeColor: string;
}

export const REPORT_TYPES: Record<ReportType, ReportTypeConfig> = {
  evaluation: {
    key: 'evaluation',
    name: 'Evaluation Report',
    description: 'Initial assessment and recovery feasibility analysis',
    icon: FileText,
    color: '#3b82f6', // blue
    badgeColor: '#3b82f6',
  },
  service: {
    key: 'service',
    name: 'Service Report',
    description: 'Detailed documentation of service work performed',
    icon: Wrench,
    color: '#10b981', // green
    badgeColor: '#10b981',
  },
  server: {
    key: 'server',
    name: 'Server Report',
    description: 'Server-specific recovery with RAID and infrastructure details',
    icon: Server,
    color: '#14b8a6', // teal
    badgeColor: '#14b8a6',
  },
  malware: {
    key: 'malware',
    name: 'Malware Report',
    description: 'Malware infection analysis and remediation',
    icon: Shield,
    color: '#ef4444', // red
    badgeColor: '#ef4444',
  },
  forensic: {
    key: 'forensic',
    name: 'Forensic Report',
    description: 'Legal forensic reports with chain of custody integration',
    icon: Scale,
    color: '#06b6d4', // cyan
    badgeColor: '#06b6d4',
  },
  data_destruction: {
    key: 'data_destruction',
    name: 'Data Destruction Report',
    description: 'Certified data destruction documentation',
    icon: Trash2,
    color: '#dc2626', // dark red
    badgeColor: '#dc2626',
  },
  prevention: {
    key: 'prevention',
    name: 'Prevention Report',
    description: 'Preventative recommendations and best practices',
    icon: AlertTriangle,
    color: '#f59e0b', // amber
    badgeColor: '#f59e0b',
  },
  recovered_files: {
    key: 'recovered_files',
    name: 'Recovered Files Report',
    description: 'Recovered-file manifest summary for customer delivery',
    icon: Files,
    color: '#0d9488', // teal (darker)
    badgeColor: '#0d9488',
  },
};

export const REPORT_STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; color: string }
> = {
  draft: {
    label: 'Draft',
    color: '#64748b', // slate
  },
  review: {
    label: 'In Review',
    color: '#3b82f6', // blue
  },
  approved: {
    label: 'Approved',
    color: '#10b981', // green
  },
  sent: {
    label: 'Sent',
    color: '#14b8a6', // teal
  },
};

export function getReportTypeConfig(type: ReportType): ReportTypeConfig {
  return REPORT_TYPES[type];
}

export function getReportStatusConfig(status: ReportStatus) {
  return REPORT_STATUS_CONFIG[status];
}

export function getReportTypeName(type: ReportType): string {
  return REPORT_TYPES[type]?.name || type;
}

export function getReportTypeIcon(type: ReportType): LucideIcon {
  return REPORT_TYPES[type]?.icon || FileText;
}

export function getReportTypeColor(type: ReportType): string {
  return REPORT_TYPES[type]?.color || '#64748b';
}

export interface ReportTemplate {
  id: string;
  template_name: string;
  report_type: ReportType;
  description: string;
  template_structure: {
    sections: ReportSection[];
  };
  is_active: boolean;
  is_default: boolean;
  /** NULL = shared system template; non-NULL = tenant override (clone-to-edit). */
  tenant_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportSection {
  key: string;
  title: string;
  description: string;
  order: number;
  required: boolean;
  type: 'rich_text' | 'table' | 'chain_of_custody' | 'certification';
}

export interface Report {
  id: string;
  case_id: string;
  report_number: string;
  report_type: ReportType;
  title: string;
  content?: string;
  status: ReportStatus;
  findings?: string;
  recommendations?: string;
  visible_to_customer: boolean;
  pdf_file_path?: string;
  version_number: number;
  parent_report_id?: string;
  is_latest_version: boolean;
  version_notes?: string;
  report_template_id?: string;
  template_sections?: any;
  forensic_chain_of_custody_id?: string;
  approved_by?: string;
  approved_at?: string;
  created_by?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  sent_to_customer_at?: string;
  created_at: string;
  updated_at: string;
  created_by_profile?: {
    full_name: string;
  };
  reviewed_by_profile?: {
    full_name: string;
  };
  approved_by_profile?: {
    full_name: string;
  };
}

export interface ReportSectionData {
  id: string;
  report_id: string;
  section_key: string;
  section_title: string;
  section_content: string;
  section_order: number;
  is_required: boolean;
  metadata?: any;
  created_at: string;
  updated_at: string;
}
