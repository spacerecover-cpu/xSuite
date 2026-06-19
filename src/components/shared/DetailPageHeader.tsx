import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Present → an ancestor <Link>. Absent on the final crumb (the current page). */
  to?: string;
}

export interface DetailPageHeaderProps {
  /** Breadcrumb trail. The LAST crumb is the current page and renders as the
   *  <h1> title; earlier crumbs render as ancestor links above it. */
  breadcrumbs: Crumb[];
  /** Status + secondary badges, shown beside the title. */
  badges?: React.ReactNode;
  /** Right-aligned action buttons (wraps on small screens). */
  actions?: React.ReactNode;
  /** Compact muted line beneath the title — e.g. <AuditInfo …/>. */
  meta?: React.ReactNode;
}

/**
 * Shared, compact detail-page header. The breadcrumb's final crumb IS the page
 * title (rendered once as an <h1>), so the title is never duplicated. Ancestor
 * crumbs are router links. `badges`, `actions`, and `meta` are caller-composed
 * slots. The block is gutter-neutral — the page's padded container (px-6 py-5)
 * supplies the horizontal gutter so the header aligns with the page content;
 * this adds only a bottom margin to separate from what follows.
 */
export const DetailPageHeader: React.FC<DetailPageHeaderProps> = ({
  breadcrumbs,
  badges,
  actions,
  meta,
}) => {
  const ancestors = breadcrumbs.slice(0, -1);
  const current = breadcrumbs[breadcrumbs.length - 1];
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {ancestors.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-1">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                {ancestors.map((crumb, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="w-4 h-4 text-slate-300" aria-hidden="true" />}
                    {crumb.to ? (
                      <Link to={crumb.to} className="hover:text-primary transition-colors">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 aria-current="page" className="text-2xl font-bold text-slate-900">{current?.label}</h1>
            {badges}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="mt-2 text-sm text-slate-500">{meta}</div>}
    </div>
  );
};
