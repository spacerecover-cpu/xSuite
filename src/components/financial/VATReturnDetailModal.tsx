import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';
import {
  getReturnLines,
  getReturnLedgerRows,
  type VatReturnRow,
  type TaxReturnLineRow,
  type VatRecordRow,
} from '../../lib/tax/taxReturnService';
import { logger } from '../../lib/logger';

interface VATReturnDetailModalProps {
  vatReturn: VatReturnRow | null;
  onClose: () => void;
}

export const VATReturnDetailModal: React.FC<VATReturnDetailModalProps> = ({ vatReturn, onClose }) => {
  const { formatCurrency } = useCurrency();
  const [lines, setLines] = useState<TaxReturnLineRow[]>([]);
  const [ledger, setLedger] = useState<VatRecordRow[]>([]);

  useEffect(() => {
    if (!vatReturn) return;
    let cancelled = false;
    Promise.all([getReturnLines(vatReturn.id), getReturnLedgerRows(vatReturn)])
      .then(([l, r]) => { if (!cancelled) { setLines(l); setLedger(r); } })
      .catch((e) => { if (!cancelled) logger.error('Error loading return detail:', e); });
    return () => { cancelled = true; };
  }, [vatReturn]);

  if (!vatReturn) return null;

  const ledgerOutput = ledger
    .filter((r) => r.record_type === 'sale')
    .reduce((s, r) => s + Number(r.vat_amount_base ?? 0), 0);
  const ledgerInput = ledger
    .filter((r) => r.record_type === 'purchase')
    .reduce((s, r) => s + Number(r.vat_amount_base ?? 0), 0);
  const reconciled =
    Math.abs(ledgerOutput - Number(vatReturn.output_vat)) <= 0.0001 &&
    Math.abs(ledgerInput - Number(vatReturn.input_vat)) <= 0.0001;

  return (
    <Modal isOpen onClose={onClose} title={`Return ${vatReturn.period_start} → ${vatReturn.period_end}`} subtitle="Review this VAT return and its boxes." icon={FileText} size="xl" showClose>
      <div className="space-y-6">
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
            reconciled ? 'border-success bg-success-muted text-success' : 'border-danger bg-danger-muted text-danger'
          }`}
        >
          {reconciled ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {reconciled
            ? 'Reconciled — the filed boxes equal the tax_period subledger exactly'
            : 'NOT reconciled — subledger has changed since filing; investigate before submission'}
        </div>

        <div className="divide-y divide-border rounded-lg border border-border">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-4 py-2">
              <div>
                <span className="text-sm">{l.box_label}</span>
                {l.quantity != null && (
                  <div className="text-xs text-slate-500 tabular-nums">
                    {`Qty ${Number(l.quantity)}${l.unit_code ? ` ${l.unit_code}` : ''}`}
                  </div>
                )}
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(l.amount_base))}</span>
            </div>
          ))}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Supporting subledger rows (tax_period dimension)</h3>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left">
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2 text-right">Tax (base)</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.tax_period}</td>
                    <td className="px-3 py-1.5 capitalize">{r.record_type}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.record_id}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatCurrency(Number(r.vat_amount_base ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
};
