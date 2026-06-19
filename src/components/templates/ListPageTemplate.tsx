// src/components/templates/ListPageTemplate.tsx
import React from 'react';
import { cn } from '../../lib/utils';
import { PageHeaderSlot } from '../layout/PageHeaderSlot';
import { Pager } from '../ui/Pager';
import { ListPageSkeleton } from './ListPageSkeleton';
import type { PagerSlotProps } from '../../hooks/useListPage';

export interface ListPageTemplateProps {
  /** Portaled to the top bar via PageHeaderSlot. */
  title: string;
  headerActions?: React.ReactNode;
  kpis?: React.ReactNode;
  toolbar?: React.ReactNode;
  /** Page owns its <table>; no column registry. */
  table: React.ReactNode;
  /** Spread useListPage().pagerProps (+ itemNoun); omit to hide the pager. */
  pager?: PagerSlotProps;
  empty?: React.ReactNode;
  loading?: boolean;
  isEmpty?: boolean;
  /** e.g. BulkActionsBar — rendered outside the table card. */
  footer?: React.ReactNode;
  /** Modals / deep-link effects — page-owned. */
  children?: React.ReactNode;
  loadingFallback?: React.ReactNode;
  /** Skip the white table-card wrapper (table supplies its own surface). */
  unstyledBody?: boolean;
}

/**
 * Thin list shell. Owns the px-6 py-5 container, the top-bar header slot, the
 * white table-card chrome, the Pager footer, and the standard loading/empty
 * swap. Every domain region (kpis/toolbar/table/footer/children) is a ReactNode
 * slot — no column/filter/modal registry. Requires HeaderSlotProvider (AppLayout).
 */
export const ListPageTemplate: React.FC<ListPageTemplateProps> = ({
  title,
  headerActions,
  kpis,
  toolbar,
  table,
  pager,
  empty,
  loading = false,
  isEmpty = false,
  footer,
  children,
  loadingFallback,
  unstyledBody = false,
}) => (
  <div className="px-6 py-5 max-w-[1800px] mx-auto">
    <PageHeaderSlot title={title} actions={headerActions} />
    {loading ? (
      loadingFallback ?? <ListPageSkeleton />
    ) : (
      <>
        {kpis}
        {toolbar}
        {isEmpty ? (
          empty
        ) : (
          <div className={cn(!unstyledBody && 'bg-white rounded-xl border border-slate-200 overflow-hidden')}>
            {table}
            {pager && <Pager {...pager} />}
          </div>
        )}
        {footer}
      </>
    )}
    {children}
  </div>
);
