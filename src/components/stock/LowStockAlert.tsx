import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LowStockAlertProps {
  count: number;
  onDismiss?: () => void;
}

export function LowStockAlert({ count, onDismiss }: LowStockAlertProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-warning-muted border border-warning/30 rounded-lg">
      <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
      <p className="flex-1 text-sm text-warning">
        <span className="font-semibold">{count} item{count !== 1 ? 's' : ''}</span> are running low on stock.
      </p>
      <Link
        to="/stock?filter=low-stock"
        className="text-sm font-medium text-warning underline underline-offset-2 hover:text-warning/80 whitespace-nowrap"
      >
        View Low Stock
      </Link>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-warning-muted/80 transition-colors text-warning hover:text-warning/80"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
