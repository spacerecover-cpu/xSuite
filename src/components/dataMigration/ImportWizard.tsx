import React, { useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Download,
  Loader2,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { parseWorkbook, readWorkbookMeta, computeFileHash } from '../../lib/dataMigration/workbookParser';
import { validateWorkbook, validateSchemaVersion } from '../../lib/dataMigration/importValidator';
import { runImport } from '../../lib/dataMigration/importClient';
import { IMPORT_ORDER, SHEET_NAMES } from '../../lib/dataMigration/workbookContract';
import type { ParsedWorkbook, EntityType } from '../../lib/dataMigration/workbookContract';
import type { ValidationReport, ValidationIssue } from '../../lib/dataMigration/importValidator';
import type { ImportProgress, ImportSummary } from '../../lib/dataMigration/importClient';

type WizardStep = 'upload' | 'validate' | 'import' | 'summary';

interface FileMeta { filename: string; hash: string; }

interface Props { onClose: () => void; }

function downloadErrorReport(issues: ValidationIssue[]): void {
  const lines = ['Entity,Row,Field,Severity,Message'];
  for (const iss of issues) {
    lines.push(`${iss.entity},${iss.rowIndex},${iss.field ?? ''},${iss.severity},${iss.message}`);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'import-validation-errors.csv';
  a.click();
  URL.revokeObjectURL(url);
}

const STEP_LABELS: Record<WizardStep, string> = {
  upload: 'Upload',
  validate: 'Validate / Preview',
  import: 'Import',
  summary: 'Summary',
};

export const ImportWizard: React.FC<Props> = ({ onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedWb, setParsedWb] = useState<ParsedWorkbook | null>(null);
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const [hash, wb] = await Promise.all([
        computeFileHash(buf),
        Promise.resolve(parseWorkbook(buf)),
      ]);
      const report = validateWorkbook(wb);
      // I3: reject incompatible workbook schema versions before anything else.
      const versionCheck = validateSchemaVersion(readWorkbookMeta(buf));
      if (!versionCheck.ok) {
        report.issues.unshift({
          entity: IMPORT_ORDER[0],
          rowIndex: -1,
          severity: 'error',
          field: 'schema_version',
          message: versionCheck.message ?? 'Incompatible workbook schema version.',
        });
        report.ok = false;
      }
      setParsedWb(wb);
      setFileMeta({ filename: file.name, hash });
      setValidation(report);
      setStep('validate');
    } finally {
      setParsing(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void handleFile(f);
  }

  async function startImport() {
    if (!parsedWb || !fileMeta) return;
    setImporting(true);
    setImportError(null);
    setStep('import');
    try {
      const result = await runImport(parsedWb, fileMeta, (p) => setProgress({ ...p }));
      setSummary(result);
      setStep('summary');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  const errorCount = validation?.issues.filter((i) => i.severity === 'error').length ?? 0;
  const warningCount = validation?.issues.filter((i) => i.severity === 'warning').length ?? 0;

  const steps: WizardStep[] = ['upload', 'validate', 'import', 'summary'];

  return (
    <Modal isOpen onClose={onClose} title="Import Data" size="xl" closeOnBackdrop={false}>
      <div className="space-y-6">
        {/* Step breadcrumb */}
        <nav aria-label="Import steps" className="flex items-center gap-1 text-sm">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <span className={s === step ? 'font-semibold text-primary' : 'text-slate-400'}>
                {STEP_LABELS[s]}
              </span>
              {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
            </React.Fragment>
          ))}
        </nav>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div>
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {parsing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-sm text-slate-600">Parsing workbook&hellip;</p>
                </div>
              ) : (
                <>
                  <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium mb-1">Drop your .xlsx workbook here</p>
                  <p className="text-sm text-slate-500 mb-4">or click below to browse</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label="Browse file"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-1.5" />
                    Browse File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx"
                    className="sr-only"
                    onChange={handleInputChange}
                  />
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Step: Validate / Preview */}
        {step === 'validate' && validation && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {validation.ok ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <XCircle className="w-5 h-5 text-danger" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {fileMeta?.filename}
                </p>
                <p className="text-xs text-slate-500">
                  {validation.ok
                    ? 'Validation passed — ready to import'
                    : `${errorCount} error${errorCount !== 1 ? 's' : ''}${warningCount > 0 ? `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}` : ''}`}
                </p>
              </div>
            </div>

            {/* Per-entity counts */}
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {IMPORT_ORDER.map((entity) => {
                const count = validation.counts[entity] ?? 0;
                return (
                  <div key={entity} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-700">{SHEET_NAMES[entity] ?? entity}</span>
                    <Badge variant="secondary" size="sm">{count}</Badge>
                  </div>
                );
              })}
            </div>

            {/* Issues */}
            {validation.issues.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Validation Issues</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadErrorReport(validation.issues)}
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download Error Report
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-danger/30 bg-danger/5 divide-y divide-danger/10">
                  {validation.issues.slice(0, 50).map((iss, i) => (
                    <div key={i} className="px-3 py-2 flex items-start gap-2 text-xs">
                      {iss.severity === 'error' ? (
                        <XCircle className="w-3.5 h-3.5 text-danger mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
                      )}
                      <span className="text-slate-700">
                        <span className="font-medium">{iss.entity}</span>
                        {iss.field && <> / {iss.field}</>}
                        {' '}row {iss.rowIndex}: {iss.message}
                      </span>
                    </div>
                  ))}
                  {validation.issues.length > 50 && (
                    <p className="px-3 py-2 text-xs text-slate-500">&hellip;and {validation.issues.length - 50} more. Download the report for the full list.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="secondary" size="sm" onClick={() => setStep('upload')}>Back</Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
                {validation.ok && (
                  <Button variant="primary" size="sm" onClick={() => void startImport()} aria-label="Import">
                    Import
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step: Import — live progress */}
        {step === 'import' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <p className="text-sm font-medium text-slate-900">
                {importing ? 'Importing…' : importError ? 'Import failed' : 'Finishing up…'}
              </p>
            </div>

            {/* Per-stage progress bars */}
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {IMPORT_ORDER.map((entity) => {
                const isActive = progress?.entity === entity;
                const isDone = progress
                  ? IMPORT_ORDER.indexOf(entity) < IMPORT_ORDER.indexOf(progress.entity)
                  : false;
                const pct = isActive && progress && progress.total > 0
                  ? Math.round((progress.processed / progress.total) * 100)
                  : isDone ? 100 : 0;

                return (
                  <div key={entity} className="px-4 py-3">
                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                      <span className={isActive ? 'font-semibold text-primary' : isDone ? 'text-success' : ''}>
                        {SHEET_NAMES[entity] ?? entity}
                      </span>
                      <span>
                        {isDone ? (
                          <CheckCircle className="w-3.5 h-3.5 text-success inline" />
                        ) : isActive && progress ? (
                          `${progress.processed} / ${progress.total}`
                        ) : null}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${isDone ? 'bg-success' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {importError && (
              <div className="rounded-lg bg-danger/5 border border-danger/30 px-4 py-3 text-sm text-danger">
                {importError}
              </div>
            )}

            {importError && (
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
                <Button variant="primary" size="sm" onClick={() => void startImport()}>Retry</Button>
              </div>
            )}
          </div>
        )}

        {/* Step: Summary */}
        {step === 'summary' && summary && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-success" />
              <div>
                <p className="font-semibold text-slate-900">Import Complete</p>
                <p className="text-xs text-slate-500">Run ID: {summary.runId}</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {(Object.entries(summary.counts) as [EntityType, { inserted: number; skipped: number; error: number }][]).map(
                ([entity, c]) => (
                  <div key={entity} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{SHEET_NAMES[entity] ?? entity}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-success font-medium">{c.inserted} inserted</span>
                      <span className="text-slate-500">{c.skipped} skipped</span>
                      {c.error > 0 && <span className="text-danger font-medium">{c.error} error</span>}
                    </div>
                  </div>
                ),
              )}
            </div>

            {summary.errorReport && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const url = URL.createObjectURL(new Blob([summary.errorReport!]));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'import-errors.xlsx';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4 mr-1.5" />
                Download Error Report
              </Button>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
