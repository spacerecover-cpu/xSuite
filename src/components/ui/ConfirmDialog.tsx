import { useId } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { STATUS_TONE, STATUS_TONE_MUTED } from '../../lib/ui/variants';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const Icon = variant === 'danger' ? Trash2 : AlertTriangle;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      closeOnBackdrop={!isLoading}
      closeOnEscape={!isLoading}
      className="max-w-md p-6"
    >
      <button
        onClick={onClose}
        disabled={isLoading}
        aria-label={t('ui.close')}
        className="absolute top-4 right-4 p-1 hover:bg-surface-muted rounded transition-colors disabled:opacity-50"
      >
        <X className="w-5 h-5 text-slate-400" />
      </button>

      <div className="flex items-start gap-4">
        <div className={cn('p-3 rounded-full', STATUS_TONE_MUTED[variant])}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 pt-1">
          <h3 id={titleId} className="text-lg font-semibold text-slate-900 mb-2 pr-10">{title}</h3>
          <p className="text-sm text-slate-600 mb-6">{message}</p>
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={isLoading}>
              {cancelText ?? t('common.cancel')}
            </Button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              aria-busy={isLoading}
              className={cn('px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 hover:opacity-90', STATUS_TONE[variant])}
            >
              {isLoading ? t('ui.processing') : confirmText ?? t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
