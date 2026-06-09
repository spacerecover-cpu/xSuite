import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, CheckCircle, Loader } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  EntityType,
  ENTITY_CONFIGS,
  createJob,
  exportToCSV,
} from '../../lib/importExportService';
import { supabase } from '../../lib/supabaseClient';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';
import type { Database } from '../../types/database.types';

type TableName = keyof Database['public']['Tables'];

interface ExportWizardProps {
  entityType: EntityType;
  onClose: () => void;
}

type ExportFormat = 'csv' | 'excel';

export const ExportWizard: React.FC<ExportWizardProps> = ({ entityType, onClose }) => {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [exportResult, setExportResult] = useState<{ url: string; recordCount: number } | null>(null);

  const queryClient = useQueryClient();
  const config = ENTITY_CONFIGS[entityType];

  const exportMutation = useMutation({
    mutationFn: async () => {
      // Fetch data from database first. The dynamic table name expands into a
      // 200+ table union that triggers TS2589 (excessively deep) — narrow the
      // builder type once via an unknown-cast so subsequent filter calls don't
      // re-trigger union expansion.
      type LooseBuilder = {
        select: (cols: string) => LooseBuilder;
        gte: (column: string, value: string) => LooseBuilder;
        lte: (column: string, value: string) => LooseBuilder;
        then: <T>(onFulfilled: (value: { data: unknown[] | null; error: { message: string } | null }) => T) => Promise<T>;
      };
      type LooseClient = { from: (table: string) => LooseBuilder };
      const sb = supabase as unknown as LooseClient;
      let query: LooseBuilder = sb.from(config.tableName as TableName).select('*');

      // Apply date filters if specified
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const { data, error } = (await query) as unknown as { data: unknown[] | null; error: { message: string } | null };
      if (error) {
        logger.error('Export error:', error);
        throw new Error(`Failed to export ${config.label}: ${error.message}`);
      }

      // Generate CSV
      const csvContent = exportToCSV((data || []) as unknown as Record<string, any>[], selectedColumns.length > 0 ? selectedColumns : undefined);

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);

      // Try to create job record (optional - won't fail if table doesn't exist)
      try {
        await createJob('export', entityType, `${config.label}_export.${format}`, {
          format,
          dateFrom,
          dateTo,
          selectedColumns,
        });
      } catch (err) {
        logger.error('Could not create job record:', err);
      }

      return { url, recordCount: data?.length || 0 };
    },
    onSuccess: (result) => {
      setExportResult({ url: result.url, recordCount: result.recordCount });
      setStep(4);
      queryClient.invalidateQueries({ queryKey: ['import_export_jobs_recent'] });
    },
    onError: (error: unknown) => {
      logger.error('Export failed:', error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      // Get all available columns if none selected
      if (selectedColumns.length === 0) {
        const sampleFields = [
          ...config.requiredFields,
          ...config.uniqueFields,
          ...config.dateFields,
          ...config.numberFields,
          ...Object.keys(config.referenceFields),
        ];
        setSelectedColumns([...new Set(sampleFields)]);
      }
      setStep(3);
    } else if (step === 3) {
      exportMutation.mutate();
    }
  };

  const handleColumnToggle = (column: string) => {
    setSelectedColumns((prev) =>
      prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]
    );
  };

  const handleDownload = () => {
    if (exportResult) {
      const link = document.createElement('a');
      link.href = exportResult.url;
      link.download = `${config.label.toLowerCase()}_export_${new Date().toISOString().split('T')[0]}.${format}`;
      link.click();
      URL.revokeObjectURL(exportResult.url);
      onClose();
    }
  };

  const allColumns = [
    ...config.requiredFields,
    ...config.uniqueFields,
    ...config.dateFields,
    ...config.numberFields,
    ...Object.keys(config.referenceFields),
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Modal isOpen={true} onClose={onClose} size="xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Export {config.label}</h2>
          <p className="text-slate-600 mt-1">Step {step} of 4</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full mx-1 transition-colors ${
                s <= step ? 'bg-primary' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span className={step >= 1 ? 'text-primary font-medium' : ''}>Format</span>
          <span className={step >= 2 ? 'text-primary font-medium' : ''}>Filters</span>
          <span className={step >= 3 ? 'text-primary font-medium' : ''}>Columns</span>
          <span className={step >= 4 ? 'text-primary font-medium' : ''}>Download</span>
        </div>
      </div>

      {/* Step 1: Format Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Select Export Format</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setFormat('csv')}
                className={`p-6 border-2 rounded-xl text-left transition-all ${
                  format === 'csv'
                    ? 'border-primary bg-info-muted'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <FileText className={`w-8 h-8 mb-3 ${format === 'csv' ? 'text-primary' : 'text-slate-400'}`} />
                <h3 className="font-semibold text-slate-900 mb-1">CSV Format</h3>
                <p className="text-sm text-slate-600">
                  Comma-separated values, compatible with Excel and most tools
                </p>
              </button>

              <button
                onClick={() => setFormat('excel')}
                className={`p-6 border-2 rounded-xl text-left transition-all ${
                  format === 'excel'
                    ? 'border-primary bg-info-muted'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <FileText className={`w-8 h-8 mb-3 ${format === 'excel' ? 'text-primary' : 'text-slate-400'}`} />
                <h3 className="font-semibold text-slate-900 mb-1">Excel Format</h3>
                <p className="text-sm text-slate-600">
                  XLSX format with formatting, ideal for Excel users
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Date Filters */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-slate-900 mb-4">Filter Records (Optional)</h3>
            <p className="text-sm text-slate-600 mb-6">
              Leave blank to export all records, or set a date range to filter records.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">From Date</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="Start date"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">To Date</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="End date"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Column Selection */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Select Columns to Export</h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedColumns(allColumns)}
              >
                Select All
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedColumns([])}
              >
                Clear All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto p-4 bg-slate-50 rounded-lg">
            {allColumns.map((column) => (
              <label
                key={column}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-primary/40 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(column)}
                  onChange={() => handleColumnToggle(column)}
                  className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                />
                <span className="text-sm text-slate-700 font-medium">{column}</span>
              </label>
            ))}
          </div>

          <p className="text-sm text-slate-600">
            {selectedColumns.length > 0
              ? `${selectedColumns.length} columns selected`
              : 'All columns will be exported'}
          </p>
        </div>
      )}

      {/* Step 4: Download Result */}
      {step === 4 && exportResult && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-success" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Export Complete!</h3>
          <p className="text-slate-600 mb-6">
            Successfully exported {exportResult.recordCount.toLocaleString()} records
          </p>

          <Button onClick={handleDownload} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Download className="w-4 h-4 mr-2" />
            Download File
          </Button>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
        <Button variant="ghost" onClick={step === 1 ? onClose : () => setStep(step - 1)} disabled={exportMutation.isPending}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>

        {step < 4 && (
          <Button
            onClick={handleNext}
            disabled={exportMutation.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {exportMutation.isPending ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : step === 3 ? (
              'Export'
            ) : (
              'Next'
            )}
          </Button>
        )}
      </div>
    </Modal>
  );
};
