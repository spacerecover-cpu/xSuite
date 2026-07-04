import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RequirementFailure } from '../../lib/taxDocumentService';

interface RequirementFailuresPanelProps {
  failures: RequirementFailure[];
}

/** Renders the dry-run's `requirement_failures`: `block` failures stop
 *  issuance (danger tokens), `warn` failures are advisory (warning tokens).
 *  Empty list → renders nothing so callers can mount it unconditionally. */
export function RequirementFailuresPanel({ failures }: RequirementFailuresPanelProps) {
  const { t } = useTranslation();
  if (failures.length === 0) return null;

  const blocks = failures.filter((f) => f.level === 'block');
  const warns = failures.filter((f) => f.level === 'warn');

  return (
    <div className="space-y-2">
      {blocks.length > 0 && (
        <div className="rounded-md border border-danger/40 bg-danger-muted p-3">
          <div
            className="flex items-center gap-2 text-sm font-semibold text-danger"
            data-testid="requirement-block-count"
          >
            <ShieldAlert className="h-4 w-4" />
            {t(
              blocks.length === 1
                ? 'financial.requirementFailures.blockingSingular'
                : 'financial.requirementFailures.blockingPlural',
              { count: blocks.length },
            )}
          </div>
          <ul className="mt-1 list-disc pl-6 text-sm text-danger">
            {blocks.map((f) => <li key={f.field_key}>{f.message}</li>)}
          </ul>
        </div>
      )}
      {warns.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-muted p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" /> {t('financial.requirementFailures.reviewBeforeIssuing')}
          </div>
          <ul className="mt-1 list-disc pl-6 text-sm text-warning">
            {warns.map((f) => <li key={f.field_key}>{f.message}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
