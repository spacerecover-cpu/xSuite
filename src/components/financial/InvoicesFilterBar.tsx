import React from 'react';
import { Button } from '../ui/Button';
import { Search, Filter } from 'lucide-react';

export interface InvoicesFilterBarProps {
  search: string;
  onSearch: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  typeFilter: string;
  setTypeFilter: (s: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
}

/**
 * Invoices filter bar — lifted verbatim from InvoicesListPage. Presentational:
 * search input + quick status/type toggles + the collapsible "More Filters"
 * panel. The search input is rebound to search/onSearch; all token classes are
 * unchanged.
 */
export const InvoicesFilterBar: React.FC<InvoicesFilterBarProps> = ({
  search,
  onSearch,
  statusFilter,
  setStatusFilter,
  typeFilter,
  setTypeFilter,
  showFilters,
  setShowFilters,
}) => (
  <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-4">
    <div className="px-4 py-3">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
        <div className="w-full lg:w-80 relative flex-shrink-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by invoice number, case number, or customer name"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="flex-1 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'draft'
                ? 'bg-slate-500 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Draft
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'sent' ? 'all' : 'sent')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'sent'
                ? 'bg-info text-info-foreground shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Sent
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'paid' ? 'all' : 'paid')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'paid'
                ? 'bg-success text-success-foreground shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Paid
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'overdue'
                ? 'bg-danger text-danger-foreground shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Overdue
          </button>
          <div className="h-6 w-px bg-slate-300 mx-2"></div>
          <button
            onClick={() => setTypeFilter(typeFilter === 'proforma' ? 'all' : 'proforma')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              typeFilter === 'proforma'
                ? 'bg-accent text-accent-foreground shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Proforma
          </button>
          <button
            onClick={() =>
              setTypeFilter(typeFilter === 'tax_invoice' ? 'all' : 'tax_invoice')
            }
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              typeFilter === 'tax_invoice'
                ? 'bg-cat-1 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tax Invoice
          </button>
          {(statusFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-all"
            >
              Clear All
            </button>
          )}
        </div>

        <Button
          variant="secondary"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 flex-shrink-0"
        >
          <Filter className="w-4 h-4" />
          More Filters
          {(statusFilter !== 'all' || typeFilter !== 'all') && (
            <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
          )}
        </Button>

      </div>

      {showFilters && (
        <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="all">All Types</option>
              <option value="proforma">Proforma Invoice</option>
              <option value="tax_invoice">Tax Invoice</option>
            </select>
          </div>
        </div>
      )}
    </div>
  </div>
);
