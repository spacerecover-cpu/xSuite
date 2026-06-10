import React from 'react';
import { Calendar, PencilLine, User } from 'lucide-react';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { formatDateTimeWithConfig } from '../../lib/format';

interface AuditInfoProps {
  createdAt: string | null | undefined;
  /** Display name of the creator (already resolved — see useProfileNames). */
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
  /** inline: one metadata row for detail headers. stacked: label/value rows for sidebars. */
  variant?: 'inline' | 'stacked';
  /** Label for the creation event ("Created", "Joined", "Added"…). */
  createdLabel?: string;
  className?: string;
}

const SIGNIFICANT_EDIT_MS = 60_000;

function isMeaningfulUpdate(createdAt?: string | null, updatedAt?: string | null): boolean {
  if (!createdAt || !updatedAt) return false;
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(updated)) return false;
  return updated - created > SIGNIFICANT_EDIT_MS;
}

/**
 * Consistent audit metadata ("Created … by … · Updated … by …") rendered in
 * the tenant's timezone with an explicit zone label. The title attribute
 * carries the raw UTC timestamps for disputes that need the exact instant.
 */
export const AuditInfo: React.FC<AuditInfoProps> = ({
  createdAt,
  createdByName,
  updatedAt,
  updatedByName,
  variant = 'inline',
  createdLabel = 'Created',
  className = '',
}) => {
  const dateTimeConfig = useDateTimeConfig();
  if (!createdAt) return null;

  const createdText = formatDateTimeWithConfig(createdAt, dateTimeConfig);
  const showUpdated = isMeaningfulUpdate(createdAt, updatedAt);
  const updatedText = showUpdated ? formatDateTimeWithConfig(updatedAt, dateTimeConfig) : '';
  const utcTitle = `UTC: ${createdAt}${showUpdated && updatedAt ? ` · updated ${updatedAt}` : ''}`;

  if (variant === 'stacked') {
    return (
      <dl className={`space-y-1 text-sm ${className}`} title={utcTitle}>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-slate-500">{createdLabel}:</dt>
          <dd className="font-medium text-slate-900">
            {createdText}
            {createdByName ? <span className="font-normal text-slate-600"> by {createdByName}</span> : null}
          </dd>
        </div>
        {showUpdated && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-slate-500">Last modified:</dt>
            <dd className="font-medium text-slate-900">
              {updatedText}
              {updatedByName ? <span className="font-normal text-slate-600"> by {updatedByName}</span> : null}
            </dd>
          </div>
        )}
      </dl>
    );
  }

  return (
    <div
      className={`flex items-center gap-4 text-sm text-slate-500 flex-wrap ${className}`}
      title={utcTitle}
    >
      <span className="flex items-center gap-1">
        <Calendar className="w-4 h-4" aria-hidden="true" />
        {createdLabel} {createdText}
      </span>
      <span className="flex items-center gap-1">
        <User className="w-4 h-4" aria-hidden="true" />
        by {createdByName || 'System'}
      </span>
      {showUpdated && (
        <span className="flex items-center gap-1">
          <PencilLine className="w-4 h-4" aria-hidden="true" />
          Updated {updatedText}
          {updatedByName ? ` by ${updatedByName}` : ''}
        </span>
      )}
    </div>
  );
};
