import React from 'react';
import { Receipt } from 'lucide-react';
import type { PaymentHistoryEntry } from '../../lib/invoiceService';

interface PaymentHistoryTableProps {
  entries: PaymentHistoryEntry[];
  formatMoney: (amount: number) => string;
  formatDate: (date: string | null) => string;
}

const STATUS_CLASS: Record<string, string> = {
  completed: 'bg-success-muted text-success',
  pending: 'bg-warning-muted text-warning',
  failed: 'bg-danger-muted text-danger',
  refunded: 'bg-danger-muted text-danger',
};

/**
 * The full payment trail for an invoice — receipts, allocated payments, and
 * legacy direct payments merged oldest-first with a running balance (see
 * src/lib/paymentLedger.ts). Statement-style: the last row's balance is the
 * invoice's current outstanding.
 */
export const PaymentHistoryTable: React.FC<PaymentHistoryTableProps> = ({ entries, formatMoney, formatDate }) => {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center">
        <Receipt className="mx-auto mb-2 h-6 w-6 text-slate-300" />
        <p className="text-sm text-slate-500">No payments recorded yet</p>
        <p className="mt-1 text-xs text-slate-400">Use Record Payment to register the first one.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
            <th scope="col" className="px-3 py-2">Date</th>
            <th scope="col" className="px-3 py-2">Document</th>
            <th scope="col" className="px-3 py-2">Method</th>
            <th scope="col" className="px-3 py-2">Reference</th>
            <th scope="col" className="px-3 py-2">Recorded by</th>
            <th scope="col" className="px-3 py-2 text-right">Amount</th>
            <th scope="col" className="px-3 py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const abnormal = e.status && e.status !== 'completed';
            return (
              <tr key={e.id} className="border-b border-slate-100 last:border-0 align-top" title={e.notes ?? undefined}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-700 tabular-nums">{formatDate(e.payment_date)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                        e.source === 'receipt' ? 'bg-info-muted text-info' : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {e.source}
                    </span>
                    <span className="font-medium text-slate-800">{e.doc_number ?? '—'}</span>
                    {abnormal && (
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium capitalize ${STATUS_CLASS[e.status!] ?? 'bg-slate-100 text-slate-600'}`}
                      >
                        {e.status}
                      </span>
                    )}
                  </div>
                  {e.transaction_id && (
                    <p className="mt-0.5 font-mono text-xs text-slate-400">{e.transaction_id}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">{e.method ?? '—'}</td>
                <td className="px-3 py-2 max-w-[12rem] truncate text-slate-700">{e.reference ?? '—'}</td>
                <td className="px-3 py-2 text-slate-700">{e.recorded_by ?? '—'}</td>
                <td className="px-3 py-2 text-right font-medium text-success tabular-nums whitespace-nowrap">{formatMoney(e.amount)}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{formatMoney(e.running_balance)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
