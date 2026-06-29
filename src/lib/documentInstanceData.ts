/**
 * Pure mapper: a typed document_instance (+ its sections + a case/device/customer
 * context the caller fetched) → the ReportData shape the report engine already
 * consumes. No Supabase import — the forensic-relevant shaping stays unit-testable.
 * The render path (reportConfigForSubtype → toEngineData → renderTemplate) is reused
 * unchanged; only the SOURCE differs from the legacy case_reports flow.
 */
import type { ReportData } from './pdf/documents/ReportDocument';
import type { SignatureBlockData } from './pdf/engine/types';

export interface InstanceLike {
  id: string;
  case_id: string | null;
  document_number: string | null;
  report_subtype: string | null;
  title: string;
  status: string;
  version_number: number;
  created_at: string;
  created_by: string | null;
}

export interface SectionLike {
  section_key: string;
  title: string | null;
  content: string | null;
  sort_order: number;
  is_visible: boolean;
}

/** Everything the engine needs that does NOT live on the instance row itself. */
export interface InstanceReportContext {
  caseData?: ReportData['caseData'];
  customerData?: ReportData['customerData'];
  deviceData?: ReportData['deviceData'];
  diagnosticsData?: ReportData['diagnosticsData'];
  chainOfCustodyEvents?: ReportData['chainOfCustodyEvents'];
  companySettings: ReportData['companySettings'];
  recoverability?: string | null;
  preparedByName?: string;
  signatureBlocks?: SignatureBlockData[];
}

export function mapInstanceToReportData(
  instance: InstanceLike,
  sections: SectionLike[],
  ctx: InstanceReportContext,
): ReportData {
  const visibleSorted = sections
    .filter((s) => s.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    report: {
      id: instance.id,
      case_id: instance.case_id ?? '',
      report_number: instance.document_number ?? '',
      report_type: instance.report_subtype ?? 'evaluation',
      title: instance.title,
      status: instance.status,
      version_number: instance.version_number,
      created_at: instance.created_at,
      created_by: instance.created_by ?? undefined,
    },
    sections: visibleSorted.map((s, i) => ({
      id: `${instance.id}-${s.section_key}`,
      section_key: s.section_key,
      section_title: s.title ?? '',
      section_content: s.content ?? '',
      section_order: i,
    })),
    caseData: ctx.caseData,
    customerData: ctx.customerData,
    deviceData: ctx.deviceData,
    diagnosticsData: ctx.diagnosticsData,
    chainOfCustodyEvents: ctx.chainOfCustodyEvents,
    companySettings: ctx.companySettings,
    recoverability: ctx.recoverability ?? null,
    preparedByName: ctx.preparedByName,
    signatureBlocks: ctx.signatureBlocks,
  };
}
