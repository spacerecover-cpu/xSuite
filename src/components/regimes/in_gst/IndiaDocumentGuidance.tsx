// Renders the India issue-time guidance. Block-level guard (wholly-exempt) uses the
// danger token; the two-document goods note uses the warning token. Semantic tokens
// only (DESIGN.md) — no brand hex, no purple/indigo.
import { AlertTriangle, Info } from 'lucide-react';

interface Props {
  whollyExemptMessage?: string | null;
  goodsGuidanceMessage?: string | null;
}

export function IndiaDocumentGuidance({ whollyExemptMessage, goodsGuidanceMessage }: Props) {
  if (!whollyExemptMessage && !goodsGuidanceMessage) return null;
  return (
    <div className="space-y-2">
      {whollyExemptMessage && (
        <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-muted p-3 text-danger-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-sm">{whollyExemptMessage}</p>
        </div>
      )}
      {goodsGuidanceMessage && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-muted p-3 text-warning-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-sm">{goodsGuidanceMessage}</p>
        </div>
      )}
    </div>
  );
}
