import { X } from 'lucide-react';
import { Button } from '../ui/Button';

interface BulkActionsBarProps {
  count: number;
  onClear: () => void;
  // Actions rendered as buttons to the right of the count. Pass an
  // already-instantiated <BulkActionButton /> per action, or any nodes.
  children?: React.ReactNode;
  // Optional plural-aware label override. Defaults to "row" / "rows".
  itemNoun?: string;
}

// Sticky bar that appears when count > 0. Anchored to the bottom of
// the viewport so it stays in view as the user scrolls a long list.
export function BulkActionsBar({ count, onClear, children, itemNoun = 'row' }: BulkActionsBarProps) {
  if (count === 0) return null;

  const label = `${count.toLocaleString()} ${itemNoun}${count === 1 ? '' : 's'} selected`;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-center gap-3 px-4 py-2 rounded-full shadow-2xl border border-border bg-surface">
        <button
          type="button"
          onClick={onClear}
          className="p-1 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-slate-700 whitespace-nowrap">{label}</span>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-1.5">{children}</div>
      </div>
    </div>
  );
}

interface BulkActionButtonProps {
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
}

// Lightweight Button wrapper so each consumer doesn't reinvent the
// "icon + label + variant" combination per action.
export function BulkActionButton({
  onClick,
  icon,
  label,
  variant = 'ghost',
  disabled,
}: BulkActionButtonProps) {
  return (
    <Button
      size="sm"
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5"
    >
      {icon}
      {label}
    </Button>
  );
}
