import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { downloadCSV, type ExportColumn } from '../../lib/csvExport';

interface ExportButtonProps<T> {
  /** Resolver for the rows to export. Sync or async — async lets list
   *  pages with pagination re-fetch the full matching set when the user
   *  hits Export, instead of exporting just the visible page. */
  getRows: () => T[] | Promise<T[]>;
  columns: ExportColumn<T>[];
  filename: string;
  disabled?: boolean;
  label?: string;
}

// Drop-in export button for list pages. Awaits getRows(), then triggers
// a browser download. Shows a spinner during async fetches and surfaces
// errors via toast — the user shouldn't be left wondering why nothing
// happened after they clicked.
export function ExportButton<T>({
  getRows,
  columns,
  filename,
  disabled,
  label = 'Export CSV',
}: ExportButtonProps<T>) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const rows = await getRows();
      if (rows.length === 0) {
        toast.error('Nothing to export');
        return;
      }
      downloadCSV(rows, columns, filename);
      toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error((err as Error).message || 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={disabled || loading}
      title="Export to CSV"
      className="flex items-center gap-1.5"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {label}
    </Button>
  );
}
