import { ChainOfCustodyEntry } from './chainOfCustodyService';

export interface ExportOptions {
  includeMetadata?: boolean;
  includeHashes?: boolean;
  includeSignatures?: boolean;
  watermark?: string;
}

// RFC 4180-compliant CSV field encoder. Custody exports carry user-controlled
// free text (actor_name, action_description, evidence_reference); an embedded
// double-quote left un-doubled breaks the quoted-field structure and misaligns
// the actor/hash/signature columns of the legal record. A leading =, +, -, @,
// tab or CR is also neutralized with a leading apostrophe so the field is not
// executed as a formula when the export is opened in Excel/Sheets.
function escapeCSVCell(value: unknown): string {
  let cell = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) {
    cell = `'${cell}`;
  }
  return `"${cell.replace(/"/g, '""')}"`;
}

export function exportToCSV(entries: ChainOfCustodyEntry[], caseNumber: string): void {
  const headers = [
    'Entry Number',
    'Case Number',
    'Category',
    'Action Type',
    'Description',
    'Actor Name',
    'Actor Role',
    'Occurred At',
    'Evidence Reference',
    'Hash Value',
    'Digital Signature',
  ];

  const rows = entries.map((entry) => [
    entry.entry_number,
    caseNumber,
    entry.action_category,
    entry.action_type,
    entry.action_description,
    entry.actor_name,
    entry.actor_role || '',
    entry.occurred_at,
    entry.evidence_reference || '',
    entry.hash_value || '',
    entry.digital_signature ? 'Yes' : 'No',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => escapeCSVCell(cell)).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `Chain_of_Custody_${caseNumber}_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToJSON(entries: ChainOfCustodyEntry[], caseNumber: string): void {
  const exportData = {
    caseNumber,
    exportedAt: new Date().toISOString(),
    totalEntries: entries.length,
    entries: entries.map((entry) => ({
      entryNumber: entry.entry_number,
      actionCategory: entry.action_category,
      actionType: entry.action_type,
      actionDescription: entry.action_description,
      actorName: entry.actor_name,
      actorRole: entry.actor_role,
      occurredAt: entry.occurred_at,
      evidenceReference: entry.evidence_reference,
      hashValue: entry.hash_value,
      digitalSignature: entry.digital_signature,
      beforeValues: entry.before_values,
      afterValues: entry.after_values,
      metadata: entry.metadata,
    })),
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `Chain_of_Custody_${caseNumber}_${Date.now()}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
