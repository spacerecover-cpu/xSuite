import React from 'react';
import { FieldGroup, ToggleRow } from '../controls';
import type { StudioApi } from '../TemplateStudio';

const humanize = (k: string): string =>
  k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export const TotalTab: React.FC<{ api: StudioApi }> = ({ api }) => {
  const totals = api.resolved.sections.find((s) => s.key === 'totals');
  const lines = totals?.lines;

  return (
    <div className="space-y-7">
      <FieldGroup title="Totals lines" description="Choose which summary lines appear under the table.">
        {!lines ? (
          <p className="text-sm text-slate-500">This document has no totals block.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(lines).map(([lineKey, on]) => (
              <ToggleRow
                key={lineKey}
                label={humanize(lineKey)}
                checked={on}
                onChange={(v) => api.setTotalsLine(lineKey, v)}
              />
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500">
          “Amount in words” renders the grand total spelled out (English, plus Arabic in bilingual modes).
        </p>
      </FieldGroup>
    </div>
  );
};
