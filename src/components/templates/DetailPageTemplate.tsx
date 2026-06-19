// src/components/templates/DetailPageTemplate.tsx
import React from 'react';
import { DetailPageHeader, type DetailPageHeaderProps } from '../shared/DetailPageHeader';
import { DetailPageSkeleton } from './DetailPageSkeleton';
import { DetailPageNotFound } from './DetailPageNotFound';

export interface DetailPageTemplateProps {
  header: DetailPageHeaderProps;
  /** Page-owned alert blocks; hidden when empty. */
  alerts?: React.ReactNode;
  /** The entire body — page composes its own grid/rail/tabs. */
  children: React.ReactNode;
  loading?: boolean;
  notFound?: boolean;
  loadingFallback?: React.ReactNode;
  notFoundFallback?: React.ReactNode;
  backTo?: { to: string; label: string };
  /** Rendered OUTSIDE the padded container (print <style> + modal portals). */
  outside?: React.ReactNode;
}

/**
 * Thin detail shell. Owns the px-6 py-5 container, the DetailPageHeader render,
 * the alert zone, and standardized loading/not-found defaults. The body is a
 * single children slot; `outside` renders at root (and in every state) so print
 * CSS + modals are never clipped by the container.
 */
export const DetailPageTemplate: React.FC<DetailPageTemplateProps> = ({
  header,
  alerts,
  children,
  loading = false,
  notFound = false,
  loadingFallback,
  notFoundFallback,
  backTo,
  outside,
}) => (
  <>
    {outside}
    {loading ? (
      loadingFallback ?? <DetailPageSkeleton />
    ) : notFound ? (
      notFoundFallback ?? <DetailPageNotFound backTo={backTo} />
    ) : (
      <div className="px-6 py-5 max-w-[1800px] mx-auto">
        <DetailPageHeader {...header} />
        {alerts && <div className="space-y-2 empty:hidden mb-4">{alerts}</div>}
        {children}
      </div>
    )}
  </>
);
