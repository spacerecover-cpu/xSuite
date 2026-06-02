import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { calculateVATForPeriod, VATSummary } from '../../lib/vatService';
import { useCurrency } from '../../hooks/useCurrency';
import {
  Calendar,
  Calculator,
  TrendingUp,
  TrendingDown,
  FileCheck,
  Save,
  Send,
} from 'lucide-react';
import { logger } from '../../lib/logger';

interface VATReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    data: {
      period_start: string;
      period_end: string;
      output_vat: number;
      input_vat: number;
      net_vat: number;
      status: 'draft' | 'review';
    }
  ) => Promise<void>;
}

export const VATReturnModal: React.FC<VATReturnModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const { formatCurrency } = useCurrency();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [summary, setSummary] = useState<VATSummary | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const now = new Date();
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
    const quarterEnd = new Date(now.getFullYear(), quarterMonth + 3, 0);

    setPeriodStart(quarterStart.toISOString().split('T')[0]);
    setPeriodEnd(quarterEnd.toISOString().split('T')[0]);
  }, [isOpen]);

  const handleCalculate = async () => {
    if (!periodStart || !periodEnd) return;

    setIsCalculating(true);
    try {
      const result = await calculateVATForPeriod(periodStart, periodEnd);
      setSummary(result);
    } catch (error) {
      logger.error('Error calculating VAT:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    if (periodStart && periodEnd && isOpen) {
      handleCalculate();
    }
  }, [periodStart, periodEnd, isOpen]);

  const handleSubmit = async (submitForReview: boolean = false) => {
    if (!summary) return;

    setIsSubmitting(true);
    try {
      await onSave({
        period_start: periodStart,
        period_end: periodEnd,
        output_vat: summary.totalOutputVAT,
        input_vat: summary.totalInputVAT,
        net_vat: summary.netVAT,
        status: submitForReview ? 'review' : 'draft',
      });
      handleClose();
    } catch (error) {
      logger.error('Error saving VAT return:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSummary(null);
    onClose();
  };

  const setQuarterPeriod = (quarter: number, year: number) => {
    const quarterMonth = (quarter - 1) * 3;
    const start = new Date(year, quarterMonth, 1);
    const end = new Date(year, quarterMonth + 3, 0);
    setPeriodStart(start.toISOString().split('T')[0]);
    setPeriodEnd(end.toISOString().split('T')[0]);
  };

  const currentYear = new Date().getFullYear();
  const quarters = [
    { label: 'Q1', quarter: 1 },
    { label: 'Q2', quarter: 2 },
    { label: 'Q3', quarter: 3 },
    { label: 'Q4', quarter: 4 },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create VAT Return" size="lg" initialFocusRef={firstFieldRef}>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Quick Select Period
          </label>
          <div className="flex flex-wrap gap-2">
            {quarters.map(({ label, quarter }) => (
              <button
                key={label}
                type="button"
                onClick={() => setQuarterPeriod(quarter, currentYear)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {label} {currentYear}
              </button>
            ))}
            {quarters.map(({ label, quarter }) => (
              <button
                key={`prev-${label}`}
                type="button"
                onClick={() => setQuarterPeriod(quarter, currentYear - 1)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-slate-500"
              >
                {label} {currentYear - 1}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="vat-period-start" className="block text-sm font-medium text-slate-700 mb-1">
              Period Start
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                ref={firstFieldRef}
                id="vat-period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="vat-period-end" className="block text-sm font-medium text-slate-700 mb-1">
              Period End
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                id="vat-period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>
        </div>

        {isCalculating ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
            <p className="text-slate-500 mt-3">Calculating VAT...</p>
          </div>
        ) : summary ? (
          <div className="bg-slate-50 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-slate-900">VAT Summary</h3>
              <span className="text-sm text-slate-500 ml-auto">
                {summary.recordCount} records found
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 border border-success/30">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-success" />
                  <span className="text-sm font-medium text-success">Output VAT (Sales)</span>
                </div>
                <p className="text-lg font-bold text-success">
                  {formatCurrency(summary.totalOutputVAT)}
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border border-danger/30">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-danger" />
                  <span className="text-sm font-medium text-danger">Input VAT (Purchases)</span>
                </div>
                <p className="text-lg font-bold text-danger">
                  {formatCurrency(summary.totalInputVAT)}
                </p>
              </div>
            </div>

            <div className={`rounded-lg p-4 border ${
              summary.netVAT >= 0
                ? 'bg-info-muted border-info/30'
                : 'bg-warning-muted border-warning/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck className={`w-5 h-5 ${
                    summary.netVAT >= 0 ? 'text-info' : 'text-warning'
                  }`} />
                  <span className="font-medium text-slate-900">
                    Net VAT {summary.netVAT >= 0 ? 'Payable' : 'Reclaimable'}
                  </span>
                </div>
                <p className={`text-2xl font-bold ${
                  summary.netVAT >= 0 ? 'text-info' : 'text-warning'
                }`}>
                  {formatCurrency(Math.abs(summary.netVAT))}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-50 rounded-xl">
            <Calculator className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Select a period to calculate VAT</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting || !summary}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save as Draft
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting || !summary}
            className="flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Submit for Review'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
