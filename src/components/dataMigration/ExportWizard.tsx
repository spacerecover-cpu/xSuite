import React, { useState } from 'react';
import {
  Download,
  CheckCircle,
  ChevronRight,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { runExport } from '../../lib/dataMigration/exportClient';
import { IMPORT_ORDER, SHEET_NAMES } from '../../lib/dataMigration/workbookContract';
import type { EntityType } from '../../lib/dataMigration/workbookContract';

type WizardStep = 'scope' | 'generate' | 'download';

interface Props { onClose: () => void; }

const STEP_LABELS: Record<WizardStep, string> = {
  scope: 'Scope',
  generate: 'Generate',
  download: 'Download',
};

export const ExportWizard: React.FC<Props> = ({ onClose }) => {
  const [step, setStep] = useState<WizardStep>('scope');
  const [selectedEntities, setSelectedEntities] = useState<Set<EntityType>>(
    new Set(IMPORT_ORDER as EntityType[]),
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportedBlob, setExportedBlob] = useState<ArrayBuffer | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [progressEntity, setProgressEntity] = useState<EntityType | null>(null);
  const [progressFetched, setProgressFetched] = useState(0);

  function toggleEntity(entity: EntityType) {
    setSelectedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  }

  async function startExport() {
    setExporting(true);
    setExportError(null);
    setStep('generate');
    setProgressEntity(null);
    setProgressFetched(0);
    try {
      const buf = await runExport(
        {
          entities: IMPORT_ORDER.filter((e) => selectedEntities.has(e as EntityType)) as EntityType[],
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        },
        (p) => {
          setProgressEntity(p.entity);
          setProgressFetched(p.fetched);
        },
      );
      setExportedBlob(buf);
      setStep('download');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  function downloadFile() {
    if (!exportedBlob) return;
    const url = URL.createObjectURL(new Blob([exportedBlob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `xsuite-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const steps: WizardStep[] = ['scope', 'generate', 'download'];

  return (
    <Modal isOpen onClose={onClose} title="Export Data" size="xl" closeOnBackdrop={false}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav aria-label="Export steps" className="flex items-center gap-1 text-sm">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <span className={s === step ? 'font-semibold text-primary' : 'text-slate-400'}>
                {STEP_LABELS[s]}
              </span>
              {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
            </React.Fragment>
          ))}
        </nav>

        {/* Step: Scope */}
        {step === 'scope' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Select entities to export</p>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {(IMPORT_ORDER as EntityType[]).map((entity) => (
                  <label
                    key={entity}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      checked={selectedEntities.has(entity)}
                      onChange={() => toggleEntity(entity)}
                      aria-label={SHEET_NAMES[entity] ?? entity}
                    />
                    <span className="text-sm text-slate-800">{SHEET_NAMES[entity] ?? entity}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Optional date range (by record created date)</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void startExport()}
                disabled={selectedEntities.size === 0}
                aria-label="Generate export"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Generate Export
              </Button>
            </div>
          </div>
        )}

        {/* Step: Generate — live progress */}
        {step === 'generate' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {exporting ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : exportError ? null : (
                <CheckCircle className="w-5 h-5 text-success" />
              )}
              <p className="text-sm font-medium text-slate-900">
                {exporting ? 'Building workbook…' : exportError ? 'Export failed' : 'Complete'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {(IMPORT_ORDER as EntityType[]).filter((e) => selectedEntities.has(e)).map((entity) => {
                const isActive = progressEntity === entity;
                const isDone = progressEntity
                  ? IMPORT_ORDER.indexOf(entity) < IMPORT_ORDER.indexOf(progressEntity)
                  : false;
                return (
                  <div key={entity} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className={isActive ? 'font-medium text-primary' : isDone ? 'text-success' : 'text-slate-500'}>
                      {SHEET_NAMES[entity] ?? entity}
                    </span>
                    <span className="text-xs text-slate-500">
                      {isDone ? (
                        <CheckCircle className="w-3.5 h-3.5 text-success inline" />
                      ) : isActive ? (
                        `${progressFetched} rows`
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>

            {exportError && (
              <div className="rounded-lg bg-danger/5 border border-danger/30 px-4 py-3 text-sm text-danger">
                {exportError}
              </div>
            )}

            {exportError && (
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
                <Button variant="primary" size="sm" onClick={() => { setStep('scope'); setExportError(null); }}>Back</Button>
              </div>
            )}
          </div>
        )}

        {/* Step: Download */}
        {step === 'download' && exportedBlob && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 rounded-2xl bg-success-muted flex items-center justify-center">
                <FileSpreadsheet className="w-8 h-8 text-success" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">Export Ready</p>
                <p className="text-sm text-slate-500 mt-1">Your workbook contains the selected entities and is re-importable.</p>
              </div>
              <Button variant="success" size="sm" onClick={downloadFile} aria-label="Download">
                <Download className="w-4 h-4 mr-1.5" />
                Download .xlsx
              </Button>
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
